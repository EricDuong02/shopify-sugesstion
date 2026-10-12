/**
 * Provider abstraction for chat LLMs and embeddings.
 *
 * Every provider (OpenAI, Gemini, Groq, Ollama, ...) implements this
 * interface so the chat service and the fallback chain can treat them
 * uniformly: adding a new provider means adding one class, never
 * touching the orchestration logic.
 */

export type LlmProviderId = 'openai' | 'gemini' | 'groq' | 'ollama'

export type FallbackMode =
  'free_only' | 'free_first_paid_backup' | 'paid_primary'

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmChatOptions {
  model: string
  temperature?: number
  maxTokens?: number
  /** AbortSignal used by the caller to enforce request timeouts. */
  signal?: AbortSignal
}

export interface LlmChatResult {
  text: string
  tokensIn?: number
  tokensOut?: number
}

export type LlmProviderErrorCode =
  | 'rate_limited'
  | 'quota_exceeded'
  | 'timeout'
  | 'server_error'
  | 'auth'
  | 'bad_request'
  | 'unknown'

export class LlmProviderError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly code: LlmProviderErrorCode,
    message: string,
  ) {
    super(`[${providerId}] ${message}`)
    this.name = 'LlmProviderError'
  }

  /**
   * Whether trying the next provider in the fallback chain is sensible.
   * 'bad_request' means our own request was malformed, so retrying
   * another provider would almost certainly fail the same way.
   */
  get isFallbackable(): boolean {
    return this.code !== 'bad_request'
  }
}

export interface LlmProvider {
  readonly id: LlmProviderId
  /** True when calls to this provider are billed (used for budget caps). */
  readonly isPaid: boolean

  chat(
    messages: LlmChatMessage[],
    options: LlmChatOptions,
  ): Promise<LlmChatResult>

  chatStream(
    messages: LlmChatMessage[],
    options: LlmChatOptions,
  ): AsyncIterable<string>

  embed(texts: string[], model: string): Promise<number[][]>
}
