import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import { encryptSecret } from '../llm/crypto.util'
import { LlmProviderId } from '../llm/llm-provider.interface'
import { LlmRegistryService } from '../llm/llm-registry.service'
import { CatalogSyncService } from '../services/catalog-sync.service'
import { RateLimitService } from '../services/rate-limit.service'
import { ShopAuthGuard } from './shop-auth.guard'
import { VerifiedShop } from './verified-shop.decorator'

interface UpdateChatConfigBody {
  enabled?: boolean
  llmProvider?: string
  llmModel?: string
  llmApiKey?: string
  systemPrompt?: string
  topK?: number
  temperature?: number
  rateLimitPerMin?: number
  fallbackMode?: string
  fallbackBudgetCapUsdPerDay?: number
}

interface DayCount {
  day: string
  count: number
}

interface TestProviderBody {
  llmProvider?: string
  llmModel?: string
}

interface TestProviderResult {
  ok: boolean
  error?: string
  latencyMs: number
  text?: string
}

const TEST_PROMPT = 'Reply with the single word: OK'

/**
 * Admin API for the Config and Monitoring tabs.
 *
 * The shop comes from the verified Shopify session token
 * (@VerifiedShop), so one shop can never read or write another shop's
 * chat configuration.
 */
@UseGuards(ShopAuthGuard)
@Controller({ path: 'chat-admin', version: '1' })
export class ChatAdminController {
  private readonly prisma = new PrismaClient()

  constructor(
    private readonly catalogSync: CatalogSyncService,
    private readonly rateLimit: RateLimitService,
    private readonly llmRegistry: LlmRegistryService,
  ) {}

  /** Get the chat config for the current shop, creating it on first use. */
  @Get('config')
  async getConfig(@VerifiedShop() shop: string) {
    const config = await this.ensureConfig(shop)
    return this.toSafeConfig(config)
  }

  /** Update the chat config. The API key is only stored when a new value is sent. */
  @Put('config')
  async updateConfig(
    @VerifiedShop() shop: string,
    @Body() body: UpdateChatConfigBody,
  ) {
    const data: Record<string, unknown> = {}

    if (body.enabled !== undefined) data.enabled = body.enabled
    if (body.llmProvider !== undefined) data.llmProvider = body.llmProvider
    if (body.llmModel !== undefined) data.llmModel = body.llmModel
    if (body.systemPrompt !== undefined) {
      data.systemPrompt = body.systemPrompt || null
    }
    if (body.topK !== undefined) {
      data.topK = Math.max(1, Math.min(20, Math.floor(body.topK)))
    }
    if (body.temperature !== undefined) {
      data.temperature = Math.max(0, Math.min(2, body.temperature))
    }
    if (body.rateLimitPerMin !== undefined) {
      data.rateLimitPerMin = Math.max(1, Math.floor(body.rateLimitPerMin))
    }
    if (body.fallbackMode !== undefined) data.fallbackMode = body.fallbackMode
    if (body.fallbackBudgetCapUsdPerDay !== undefined) {
      data.fallbackBudgetCapUsdPerDay = Math.max(
        0,
        body.fallbackBudgetCapUsdPerDay,
      )
    }

    if (body.llmApiKey) {
      try {
        data.llmApiKeyEnc = encryptSecret(body.llmApiKey)
      } catch (error) {
        throw new BadRequestException(
          'Could not encrypt the API key. Set CONFIG_ENCRYPTION_KEY on the server.',
        )
      }
    }

    const config = await this.prisma.chatShopConfig.upsert({
      where: { shopId: shop },
      create: { shopId: shop, publicToken: randomUUID(), ...(data as any) },
      update: data as any,
    })
    return this.toSafeConfig(config)
  }

  /** Remove the shop's custom API key (falls back to platform keys). */
  @Delete('config/api-key')
  async clearApiKey(@VerifiedShop() shop: string) {
    const config = await this.prisma.chatShopConfig.update({
      where: { shopId: shop },
      data: { llmApiKeyEnc: null },
    })
    return this.toSafeConfig(config)
  }

  /**
   * Test whether a provider + model actually works.
   *
   * Provider model catalogues are not reliable: Google listed models that
   * the API then refused for new accounts. This endpoint sends a tiny
   * prompt so merchants find out before a real chat message fails.
   */
  @Post('test-provider')
  async testProvider(@Body() body: TestProviderBody): Promise<TestProviderResult> {
    const providerId = toProviderId(body.llmProvider)
    const model = (body.llmModel || '').trim()

    if (!providerId) {
      return {
        ok: false,
        latencyMs: 0,
        error: `Unknown provider: ${body.llmProvider ?? '(missing)'}`,
      }
    }
    if (!model) {
      return { ok: false, latencyMs: 0, error: 'No model specified.' }
    }

    const [provider] = this.llmRegistry.createProviders([providerId], null)
    if (!provider) {
      return {
        ok: false,
        latencyMs: 0,
        error: `No API key available for ${providerId}. Add a key in this tab or set it on the server.`,
      }
    }

    const startedAt = Date.now()
    const aborter = new AbortController()
    const timer = setTimeout(() => aborter.abort(), 20000)

    try {
      const result = await provider.chat(
        [{ role: 'user', content: TEST_PROMPT }],
        { model, maxTokens: 16, temperature: 0, signal: aborter.signal },
      )
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        text: (result.text || '').trim().slice(0, 120),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, latencyMs: Date.now() - startedAt, error: message }
    } finally {
      clearTimeout(timer)
    }
  }

  /** Enqueue a full catalog re-embed for the current shop. */
  @Post('resync')
  async resync(@VerifiedShop() shop: string) {
    if (!this.catalogSync) {
      throw new ServiceUnavailableException('Catalog sync is not available')
    }
    await this.catalogSync.enqueueShopResync(shop)
    return { queued: true }
  }

  /** Monitoring stats for the dashboard tab. */
  @Get('stats')
  async getStats(@VerifiedShop() shop: string) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const sessionIds = (
      await this.prisma.chatSession.findMany({
        where: { shopId: shop },
        select: { id: true },
      })
    ).map((s) => s.id)

    const [
      totalSessions,
      sessionsToday,
      totalMessages,
      messagesToday,
      assistantAgg,
      fallbackCount,
      embeddingCount,
      perDay,
    ] = await Promise.all([
      this.prisma.chatSession.count({ where: { shopId: shop } }),
      this.prisma.chatSession.count({
        where: { shopId: shop, startedAt: { gte: dayAgo } },
      }),
      this.prisma.chatMessage.count({
        where: { sessionId: { in: sessionIds } },
      }),
      this.prisma.chatMessage.count({
        where: { sessionId: { in: sessionIds }, createdAt: { gte: dayAgo } },
      }),
      this.prisma.chatMessage.aggregate({
        where: { sessionId: { in: sessionIds }, role: 'assistant' },
        _count: { _all: true },
        _sum: { tokensIn: true, tokensOut: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.chatMessage.count({
        where: {
          sessionId: { in: sessionIds },
          role: 'assistant',
          fallbackUsed: true,
        },
      }),
      this.prisma.productEmbedding.count({ where: { shopId: shop } }),
      this.prisma.$queryRaw<DayCount[]>`
        SELECT to_char(date_trunc('day', m."createdAt"), 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS count
        FROM "ChatMessage" m
        JOIN "ChatSession" s ON s.id = m."sessionId"
        WHERE s."shopId" = ${shop} AND m."createdAt" >= ${weekAgo}
        GROUP BY 1
        ORDER BY 1
      `,
    ])

    const assistantTotal = assistantAgg._count._all
    const spendTodayUsd = this.rateLimit
      ? await this.rateLimit.getDailySpendUsd(shop)
      : 0

    return {
      shop,
      sessions: { total: totalSessions, today: sessionsToday },
      messages: { total: totalMessages, today: messagesToday, perDay },
      fallback: {
        count: fallbackCount,
        rate: assistantTotal > 0 ? fallbackCount / assistantTotal : 0,
      },
      tokens: {
        in: assistantAgg._sum.tokensIn ?? 0,
        out: assistantAgg._sum.tokensOut ?? 0,
      },
      latencyMsAvg: assistantAgg._avg.latencyMs ?? null,
      embeddings: embeddingCount,
      spendTodayUsd,
    }
  }

  private async ensureConfig(shop: string) {
    let config = await this.prisma.chatShopConfig.findUnique({
      where: { shopId: shop },
    })
    if (!config) {
      config = await this.prisma.chatShopConfig.create({
        data: { shopId: shop, publicToken: randomUUID() },
      })
    }
    return config
  }

  /** Never leak the encrypted API key to the admin UI. */
  private toSafeConfig(config: any) {
    const { llmApiKeyEnc, ...safe } = config
    return { ...safe, hasCustomApiKey: !!llmApiKeyEnc }
  }
}

function toProviderId(value: string | undefined): LlmProviderId | null {
  const v = (value || '').toLowerCase()
  return v === 'openai' || v === 'gemini' || v === 'groq' || v === 'ollama'
    ? v
    : null
}
