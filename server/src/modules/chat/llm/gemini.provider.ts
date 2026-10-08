import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  LlmChatMessage,
  LlmChatOptions,
  LlmChatResult,
  LlmProvider,
  LlmProviderError,
  LlmProviderErrorCode,
  LlmProviderId,
} from './llm-provider.interface'

const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * The pgvector column is vector(768). gemini-embedding-001 returns 3072
 * dims by default, and the v0.24.1 SDK does not expose
 * outputDimensionality, so embeddings go through direct REST calls.
 */
const EMBEDDING_DIMS = 768

export interface GeminiProviderConfig {
  apiKey?: string
  /** Gemini AI Studio free tier is the default assumption. */
  isPaid?: boolean
  timeoutMs?: number
}

/** Chat + embeddings provider backed by the Google Generative AI SDK. */
export class GeminiProvider implements LlmProvider {
  readonly id: LlmProviderId = 'gemini'
  readonly isPaid: boolean
  private readonly apiKey: string
  private readonly genAI: GoogleGenerativeAI
  private readonly timeoutMs: number

  constructor(config: GeminiProviderConfig = {}) {
    this.apiKey = config.apiKey || ''
    this.isPaid = config.isPaid ?? false
    this.timeoutMs = config.timeoutMs ?? 30000
    this.genAI = new GoogleGenerativeAI(this.apiKey || 'unset')
  }

  async chat(
    messages: LlmChatMessage[],
    options: LlmChatOptions,
  ): Promise<LlmChatResult> {
    try {
      const model = this.genAI.getGenerativeModel({ model: options.model })
      const { systemInstruction, contents } = this.toGeminiHistory(messages)
      const result = await this.withTimeout(
        model.generateContent({
          contents,
          ...(systemInstruction ? { systemInstruction } : {}),
          generationConfig: {
            temperature: options.temperature,
            maxOutputTokens: options.maxTokens,
          },
        }),
        this.timeoutMs,
      )
      const response = result.response
      const usage = response.usageMetadata
      return {
        text: response.text(),
        tokensIn: usage?.promptTokenCount,
        tokensOut: usage?.candidatesTokenCount,
      }
    } catch (error) {
      throw this.toProviderError(error)
    }
  }

  async *chatStream(
    messages: LlmChatMessage[],
    options: LlmChatOptions,
  ): AsyncIterable<string> {
    let streamResult
    try {
      const model = this.genAI.getGenerativeModel({ model: options.model })
      const { systemInstruction, contents } = this.toGeminiHistory(messages)
      streamResult = await model.generateContentStream({
        contents,
        ...(systemInstruction ? { systemInstruction } : {}),
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
        },
      })
    } catch (error) {
      throw this.toProviderError(error)
    }

    try {
      for await (const chunk of streamResult.stream) {
        const text = chunk.text()
        if (text) yield text
      }
    } catch (error) {
      throw this.toProviderError(error)
    }
  }

  /**
   * Embeddings via direct REST, one request per text.
   * Requests outputDimensionality=768 so the vectors match the
   * vector(768) column in ProductEmbedding.
   */
  async embed(texts: string[], model: string): Promise<number[][]> {
    const url = `${GEMINI_REST_BASE}/models/${model}:embedContent?key=${this.apiKey}`
    const results: number[][] = []

    for (const text of texts) {
      let res: Response
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text }] },
            outputDimensionality: EMBEDDING_DIMS,
          }),
        })
      } catch (error) {
        throw new LlmProviderError(
          'gemini',
          'unknown',
          `Embedding request failed: ${error}`,
        )
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new LlmProviderError(
          'gemini',
          mapHttpStatus(res.status, body),
          `Embedding failed (${res.status}): ${body.slice(0, 200)}`,
        )
      }

      const data = (await res.json()) as { embedding?: { values?: unknown } }
      const values = data?.embedding?.values
      if (!Array.isArray(values) || values.length === 0) {
        throw new LlmProviderError(
          'gemini',
          'unknown',
          'Embedding returned no values',
        )
      }
      results.push(values as number[])
    }

    return results
  }

  private toGeminiHistory(messages: LlmChatMessage[]): {
    systemInstruction?: { role: string; parts: { text: string }[] }
    contents: { role: string; parts: { text: string }[] }[]
  } {
    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n')

    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    return {
      ...(systemText
        ? {
            systemInstruction: {
              role: 'system',
              parts: [{ text: systemText }],
            },
          }
        : {}),
      contents,
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Gemini request timed out after ${ms}ms`)),
        ms,
      )
    })
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer)
    })
  }

  private toProviderError(error: unknown): LlmProviderError {
    const message = error instanceof Error ? error.message : String(error)
    return new LlmProviderError(this.id, mapGeminiError(error), message)
  }
}

function mapHttpStatus(status: number, body: string): LlmProviderErrorCode {
  const lower = (body || '').toLowerCase()
  if (status === 429) {
    return lower.includes('quota') ? 'quota_exceeded' : 'rate_limited'
  }
  if (status === 401 || status === 403) {
    return lower.includes('quota') ? 'quota_exceeded' : 'auth'
  }
  if (status === 400) return 'bad_request'
  if (status >= 500) return 'server_error'
  return 'unknown'
}

function mapGeminiError(error: unknown): LlmProviderErrorCode {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('timed out')) return 'timeout'

  const statusMatch = message.match(/(\d{3})\s/)
  const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined
  if (status !== undefined) return mapHttpStatus(status, message)

  if (lower.includes('quota')) return 'quota_exceeded'
  if (lower.includes('api key') || lower.includes('permission')) return 'auth'
  return 'unknown'
}
