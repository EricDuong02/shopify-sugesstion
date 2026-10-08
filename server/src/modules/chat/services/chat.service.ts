import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { LlmRegistryService } from '../llm/llm-registry.service'
import {
  LlmChatMessage,
  LlmProvider,
  LlmProviderError,
  LlmProviderId,
} from '../llm/llm-provider.interface'
import { estimateCostUsd, RateLimitService } from './rate-limit.service'
import { RetrievedProduct, RetrievalService } from './retrieval.service'

const MAX_MESSAGE_LENGTH = 2000
const HISTORY_LIMIT = 10
const PROVIDER_TIMEOUT_MS = 45000

export interface StreamChatInput {
  shop: string
  publicToken: string
  sessionId?: string
  message: string
  clientIp?: string
}

export type ChatStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'products'; products: RetrievedProduct[] }
  | { type: 'done'; sessionId: string; providerId: string; fallbackUsed: boolean }
  | { type: 'error'; message: string }

/**
 * Orchestrates one chat turn: shop/token validation, rate limiting,
 * session handling, RAG retrieval, prompt building, then walks the
 * provider fallback chain until one succeeds.
 */
@Injectable()
export class ChatService {
  private readonly prisma = new PrismaClient()

  constructor(
    private readonly llmRegistry: LlmRegistryService,
    private readonly retrieval: RetrievalService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Public widget bootstrap config (contains no secrets). */
  async getPublicConfig(shop: string) {
    const config = await this.prisma.chatShopConfig.findUnique({
      where: { shopId: shop },
    })
    if (!config || !config.enabled) {
      throw new NotFoundException('Chat is not enabled for this shop')
    }
    return { publicToken: config.publicToken, enabled: config.enabled }
  }

  async *streamChat(input: StreamChatInput): AsyncGenerator<ChatStreamEvent> {
    const startedAt = Date.now()
    const message = (input.message || '').trim().slice(0, MAX_MESSAGE_LENGTH)

    if (!message) {
      yield { type: 'error', message: 'Message is empty.' }
      return
    }

    // 1. Validate shop + public token.
    const config = await this.prisma.chatShopConfig.findFirst({
      where: { shopId: input.shop, publicToken: input.publicToken },
    })
    if (!config || !config.enabled) {
      yield { type: 'error', message: 'Chat is not available for this shop.' }
      return
    }

    // 2. Rate limit per shop + IP.
    const allowed = await this.rateLimit.checkLimit(
      `${input.shop}:${input.clientIp ?? 'unknown'}`,
      config.rateLimitPerMin,
    )
    if (!allowed) {
      yield {
        type: 'error',
        message: 'Too many requests. Please try again in a minute.',
      }
      return
    }

    // 3. Get or create the session.
    let sessionId = input.sessionId
    if (sessionId) {
      const existing = await this.prisma.chatSession.findFirst({
        where: { id: sessionId, shopId: input.shop },
      })
      if (!existing) sessionId = undefined
    }
    if (!sessionId) {
      const session = await this.prisma.chatSession.create({
        data: { shopId: input.shop },
      })
      sessionId = session.id
    }

    // 4. Persist the user message.
    await this.prisma.chatMessage.create({
      data: { sessionId, role: 'user', content: message },
    })

    // 5. Retrieve relevant products (best effort: chat works even if
    //    retrieval fails).
    let products: RetrievedProduct[] = []
    try {
      products = await this.retrieval.searchProducts(
        input.shop,
        message,
        config.topK,
      )
    } catch (error) {
      console.error(`[chat] retrieval failed for shop ${input.shop}:`, error)
    }
    yield { type: 'products', products }

    // 6. Build the prompt: system instruction + recent history (includes
    //    the message just saved).
    const history = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: -HISTORY_LIMIT,
    })
    const llmMessages: LlmChatMessage[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(config.systemPrompt, products),
      },
      ...history
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
    ]

    // 7. Walk the fallback chain until a provider succeeds.
    const chain = this.llmRegistry.buildChain(
      config.llmProvider,
      config.fallbackMode,
    )
    const providers = this.llmRegistry.createProviders(chain, {
      llmProvider: config.llmProvider,
      llmApiKeyEnc: config.llmApiKeyEnc,
      fallbackMode: config.fallbackMode,
    })
    if (providers.length === 0) {
      yield {
        type: 'error',
        message: 'No AI provider is configured. Please try again later.',
      }
      return
    }

    let lastError: LlmProviderError | null = null
    let fallbackUsed = false

    for (const provider of providers) {
      // Budget cap is enforced before touching a paid provider.
      if (provider.isPaid) {
        const spend = await this.rateLimit.getDailySpendUsd(input.shop)
        if (spend >= config.fallbackBudgetCapUsdPerDay) {
          lastError = new LlmProviderError(
            provider.id,
            'quota_exceeded',
            `Daily paid fallback budget reached ($${config.fallbackBudgetCapUsdPerDay}/day)`,
          )
          fallbackUsed = true
          continue
        }
      }

      const model = this.resolveModel(
        provider.id,
        config.llmProvider,
        config.llmModel,
      )
      const aborter = new AbortController()
      const timeout = setTimeout(() => aborter.abort(), PROVIDER_TIMEOUT_MS)

      try {
        let fullText = ''
        for await (const token of provider.chatStream(llmMessages, {
          model,
          temperature: config.temperature,
          signal: aborter.signal,
        })) {
          fullText += token
          yield { type: 'token', text: token }
        }
        clearTimeout(timeout)

        const latencyMs = Date.now() - startedAt
        // Token usage is estimated when the provider does not report it
        // on streams.
        const tokensOut = Math.max(1, Math.ceil(fullText.length / 4))
        const promptChars = llmMessages.reduce(
          (n, m) => n + m.content.length,
          0,
        )
        const tokensIn = Math.max(1, Math.ceil(promptChars / 4))

        if (provider.isPaid) {
          await this.rateLimit.addSpendUsd(
            input.shop,
            estimateCostUsd(model, tokensIn, tokensOut),
          )
        }

        await this.prisma.chatMessage.create({
          data: {
            sessionId,
            role: 'assistant',
            content: fullText,
            tokensIn,
            tokensOut,
            latencyMs,
            fallbackUsed,
            fallbackReason: fallbackUsed ? lastError?.message ?? null : null,
          },
        })

        yield { type: 'done', sessionId, providerId: provider.id, fallbackUsed }
        return
      } catch (error) {
        clearTimeout(timeout)
        lastError =
          error instanceof LlmProviderError
            ? error
            : new LlmProviderError(provider.id, 'unknown', String(error))

        console.error(`[chat] provider ${provider.id} failed:`, lastError.message)

        if (!lastError.isFallbackable) {
          yield { type: 'error', message: 'Chat failed. Please try again.' }
          return
        }
        fallbackUsed = true
        // Fall through to the next provider in the chain.
      }
    }

    yield {
      type: 'error',
      message: 'All AI providers failed. Please try again later.',
    }
  }

  private resolveModel(
    providerId: LlmProviderId,
    shopProvider: string,
    shopModel: string,
  ): string {
    if (providerId === shopProvider) return shopModel
    switch (providerId) {
      case 'openai':
        return process.env.CHAT_DEFAULT_LLM_MODEL || 'gpt-4o-mini'
      case 'gemini':
        return 'gemini-3.8-flash'
      case 'groq':
        return 'llama-3.3-70b-versatile'
      case 'ollama':
        return process.env.OLLAMA_CHAT_MODEL || 'qwen2.5'
    }
  }

  private buildSystemPrompt(
    customPrompt: string | null,
    products: RetrievedProduct[],
  ): string {
    const base =
      customPrompt?.trim() ||
      [
        'You are a helpful shopping assistant for an online store.',
        "Detect the customer's language from their message and always reply in that same language.",
        'Only recommend products from the list provided below.',
        'When you mention a product, include its name and URL so the customer can click through.',
        'If no product matches, say so honestly instead of inventing one.',
        'Keep answers concise and friendly.',
      ].join(' ')

    if (products.length === 0) {
      return `${base}\n\nNo products matched the customer's request in the catalog search.`
    }

    const catalog = products
      .map(
        (p, i) =>
          `${i + 1}. ${p.title ?? 'Untitled product'}` +
          (p.price != null ? ` — $${p.price}` : '') +
          (p.url ? ` — ${p.url}` : ''),
      )
      .join('\n')

    return `${base}\n\nRelevant products from the catalog (sorted by relevance):\n${catalog}`
  }
}
