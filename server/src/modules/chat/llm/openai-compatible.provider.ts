import OpenAI from 'openai'
import {
  LlmChatMessage,
  LlmChatOptions,
  LlmChatResult,
  LlmProvider,
  LlmProviderError,
  LlmProviderErrorCode,
  LlmProviderId,
} from './llm-provider.interface'

export interface OpenAICompatibleProviderConfig {
  id: Extract<LlmProviderId, 'openai' | 'groq' | 'ollama'>
  apiKey?: string
  baseURL?: string
  isPaid: boolean
  timeoutMs?: number
}

/**
 * Chat + embeddings provider backed by the OpenAI Node SDK (v4).
 * Works for OpenAI itself and any OpenAI-compatible API (Groq, Ollama)
 * by overriding baseURL. Retries are disabled here (maxRetries: 0)
 * because retry/fallback policy is handled by the caller.
 */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly id: LlmProviderId
  readonly isPaid: boolean
  private readonly client: OpenAI

  constructor(config: OpenAICompatibleProviderConfig) {
    this.id = config.id
    this.isPaid = config.isPaid
    this.client = new OpenAI({
      apiKey: config.apiKey || 'unset',
      baseURL: config.baseURL,
      timeout: config.timeoutMs ?? 30000,
      maxRetries: 0,
    })
  }

  async chat(
    messages: LlmChatMessage[],
    options: LlmChatOptions,
  ): Promise<LlmChatResult> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: options.model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: options.temperature,
          max_tokens: options.maxTokens,
        },
        { signal: options.signal },
      )
      const choice = response.choices[0]
      return {
        text: choice?.message?.content ?? '',
        tokensIn: response.usage?.prompt_tokens,
        tokensOut: response.usage?.completion_tokens,
      }
    } catch (error) {
      throw this.toProviderError(error)
    }
  }

  async *chatStream(
    messages: LlmChatMessage[],
    options: LlmChatOptions,
  ): AsyncIterable<string> {
    let stream
    try {
      stream = await this.client.chat.completions.create(
        {
          model: options.model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          stream: true,
        },
        { signal: options.signal },
      )
    } catch (error) {
      throw this.toProviderError(error)
    }

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) yield delta
      }
    } catch (error) {
      throw this.toProviderError(error)
    }
  }

  async embed(texts: string[], model: string): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model,
        input: texts,
      })
      return response.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding)
    } catch (error) {
      throw this.toProviderError(error)
    }
  }

  private toProviderError(error: unknown): LlmProviderError {
    const message = error instanceof Error ? error.message : String(error)
    return new LlmProviderError(this.id, mapOpenAIError(error), message)
  }
}

function mapOpenAIError(error: unknown): LlmProviderErrorCode {
  const status = (error as { status?: number })?.status
  const code = (error as { code?: string })?.code
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase()

  if (
    message.includes('timed out') ||
    message.includes('timeout') ||
    code === 'ETIMEDOUT'
  ) {
    return 'timeout'
  }
  if (status === 429) {
    return message.includes('quota') || message.includes('insufficient')
      ? 'quota_exceeded'
      : 'rate_limited'
  }
  if (status === 401 || status === 403) return 'auth'
  if (status === 400) return 'bad_request'
  if (status !== undefined && status >= 500) return 'server_error'
  return 'unknown'
}
