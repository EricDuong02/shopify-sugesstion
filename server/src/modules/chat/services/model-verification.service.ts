import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const VERIFY_TIMEOUT_MS = 10000

interface ProviderSpec {
  id: string
  isPaid: boolean
  listModels: (apiKey: string) => Promise<string[]>
  /** Models that can be used for chat. */
  chatLike: (id: string) => boolean
}

const NON_CHAT_PATTERNS = [
  'whisper',
  'tts',
  'embed',
  'guard',
  'moderation',
  'orpheus',
  'live',
  'image',
]

function isChatModel(id: string): boolean {
  const lower = id.toLowerCase()
  return !NON_CHAT_PATTERNS.some((pattern) => lower.includes(pattern))
}

/**
 * Verifies that the LLM models configured on the server still exist at
 * provider startup. Calls each provider's ListModels API (read-only,
 * 10s timeout) and logs a clear warning naming the retired model and
 * the available alternatives.
 *
 * Never crashes the server: missing API keys, network failures and
 * provider outages are logged and ignored.
 */
@Injectable()
export class ModelVerificationService implements OnModuleInit {
  private readonly logger = new Logger(ModelVerificationService.name)

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    // Non-blocking: never delay or fail application startup.
    this.verifyAll().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Model verification failed: ${msg}`)
    })
  }

  private async verifyAll(): Promise<void> {
    this.logger.log('Verifying configured LLM models against providers...')

    const specs = this.providerSpecs()

    await Promise.all(
      specs.map(async (spec) => {
        const apiKey = this.readEnv(spec.id === 'gemini' ? 'GEMINI_API_KEY' : `${spec.id.toUpperCase()}_API_KEY`)
        if (!apiKey) {
          this.logger.warn(
            `[${spec.id}] no API key in env, skipping model verification`,
          )
          return
        }

        try {
          const available = await spec.listModels(apiKey)
          this.checkChatModel(spec, available)

          const embeddingModel = this.configService.get<string>(
            'CHAT_DEFAULT_EMBEDDING_MODEL',
          )
          const provider = this.configService.get<string>(
            'CHAT_EMBEDDING_PROVIDER',
            'gemini',
          )
          if (provider === spec.id && embeddingModel) {
            this.checkModel(spec.id, 'embedding', embeddingModel, available)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          this.logger.warn(
            `[${spec.id}] could not list models (${msg}). Skipping check.`,
          )
        }
      }),
    )

    this.logger.log('Model verification finished.')
  }

  private checkChatModel(spec: ProviderSpec, available: string[]): void {
    const configured =
      this.configService.get<string>('CHAT_DEFAULT_LLM_MODEL', '')
    if (!configured) return

    if (available.includes(configured)) {
      this.logger.log(`[${spec.id}] chat model '${configured}' is available`)
      return
    }

    const alternatives = available.filter(spec.chatLike).slice(0, 6)
    const hint = alternatives.length
      ? `Available chat models include: ${alternatives.join(', ')}`
      : 'No chat-capable models were listed by this provider.'

    this.logger.warn(
      `[${spec.id}] configured chat model '${configured}' NOT FOUND. ` +
        `It may have been retired. ${hint} ` +
        `Set CHAT_DEFAULT_LLM_MODEL, or choose a model per shop in the Config tab.`,
    )
  }

  private checkModel(
    provider: string,
    type: string,
    model: string,
    available: string[],
  ): void {
    if (available.includes(model)) {
      this.logger.log(`[${provider}] ${type} model '${model}' is available`)
      return
    }

    const sample = available.slice(0, 8).join(', ')
    const suffix = available.length > 8 ? '...' : ''
    this.logger.warn(
      `[${provider}] ${type} model '${model}' NOT FOUND. ` +
        `It may have been retired. Available include: ${sample}${suffix}. ` +
        `Catalog sync and retrieval will fail until this is updated.`,
    )
  }

  private readEnv(key: string): string | undefined {
    const value =
      this.configService.get<string>(key) ?? process.env[key] ?? ''
    return value.trim() ? value.trim() : undefined
  }

  private providerSpecs(): ProviderSpec[] {
    return [
      {
        id: 'gemini',
        isPaid: false,
        chatLike: isChatModel,
        listModels: (apiKey) => this.listGeminiModels(apiKey),
      },
      {
        id: 'openai',
        isPaid: true,
        chatLike: isChatModel,
        listModels: (apiKey) => this.listOpenAIModels(apiKey),
      },
      {
        id: 'groq',
        isPaid: false,
        chatLike: isChatModel,
        listModels: (apiKey) => this.listGroqModels(apiKey),
      },
    ]
  }

  private async listGeminiModels(apiKey: string): Promise<string[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    const res = await this.fetchWithTimeout(url, VERIFY_TIMEOUT_MS)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { models?: { name?: string }[] }
    return (data.models || [])
      .map((m) => (m.name || '').replace(/^models\//, ''))
      .filter(Boolean)
  }

  private async listOpenAIModels(apiKey: string): Promise<string[]> {
    const res = await this.fetchWithTimeout(
      'https://api.openai.com/v1/models',
      VERIFY_TIMEOUT_MS,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { data?: { id?: string }[] }
    return (data.data || []).map((m) => m.id || '').filter(Boolean)
  }

  private async listGroqModels(apiKey: string): Promise<string[]> {
    const res = await this.fetchWithTimeout(
      'https://api.groq.com/openai/v1/models',
      VERIFY_TIMEOUT_MS,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { data?: { id?: string }[] }
    return (data.data || []).map((m) => m.id || '').filter(Boolean)
  }

  private async fetchWithTimeout(
    url: string,
    ms: number,
    init: RequestInit = {},
  ): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}
