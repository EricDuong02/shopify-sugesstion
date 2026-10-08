import { Injectable } from '@nestjs/common'
import { decryptSecret } from './crypto.util'
import { GeminiProvider } from './gemini.provider'
import {
  FallbackMode,
  LlmProvider,
  LlmProviderId,
} from './llm-provider.interface'
import { OpenAICompatibleProvider } from './openai-compatible.provider'

/** Subset of ChatShopConfig used for provider resolution. */
export interface ShopLlmConfig {
  llmProvider: string
  llmApiKeyEnc: string | null
  fallbackMode: string
}

const FREE_PROVIDERS: LlmProviderId[] = ['gemini', 'groq', 'ollama']
const PAID_PROVIDERS: LlmProviderId[] = ['openai']

const DEFAULT_FALLBACK_MODE: FallbackMode = 'free_first_paid_backup'

/**
 * Resolves LLM providers per shop: builds the ordered fallback chain from
 * ChatShopConfig and instantiates providers with the right API keys
 * (per-shop encrypted override, otherwise the shared env keys).
 *
 * The embedding provider is intentionally NOT per-shop: pgvector keeps a
 * single fixed-dimension HNSW index, so embeddings use one
 * infrastructure-level provider (CHAT_EMBEDDING_PROVIDER, default gemini).
 */
@Injectable()
export class LlmRegistryService {
  /**
   * Build the provider fallback chain.
   * The shop's primary provider always goes first (respecting the
   * merchant's choice), then remaining providers are ordered by mode:
   * free_first_paid_backup: other free providers, then paid providers
   * free_only: only free providers (paid never used)
   * paid_primary: other paid providers, then free providers
   */
  buildChain(primary: string, fallbackMode: string): LlmProviderId[] {
    const chain: LlmProviderId[] = []
    const push = (id: LlmProviderId) => {
      if (!chain.includes(id)) chain.push(id)
    }

    push(
      toProviderId(primary) ??
        toProviderId(process.env.CHAT_DEFAULT_LLM_PROVIDER) ??
        'openai',
    )

    const mode = (fallbackMode || DEFAULT_FALLBACK_MODE) as FallbackMode
    if (mode === 'free_only') {
      FREE_PROVIDERS.forEach(push)
    } else if (mode === 'paid_primary') {
      PAID_PROVIDERS.forEach(push)
      FREE_PROVIDERS.forEach(push)
    } else {
      FREE_PROVIDERS.forEach(push)
      PAID_PROVIDERS.forEach(push)
    }

    return chain
  }

  /**
   * Instantiate the providers of a chain. Providers without a usable
   * credential are skipped so the chain degrades gracefully instead of
   * crashing.
   */
  createProviders(
    chain: LlmProviderId[],
    shopConfig?: ShopLlmConfig | null,
  ): LlmProvider[] {
    return chain
      .map((id) => this.createProvider(id, shopConfig))
      .filter((p): p is LlmProvider => p !== null)
  }

  /** Embedding model name for the fixed infrastructure-level provider. */
  getEmbeddingModel(): string {
    const provider = (
      process.env.CHAT_EMBEDDING_PROVIDER || 'gemini'
    ).toLowerCase()
    return provider === 'ollama' ? 'nomic-embed-text' : 'gemini-embedding-001'
  }

  createEmbeddingProvider(): LlmProvider | null {
    const provider = (
      process.env.CHAT_EMBEDDING_PROVIDER || 'gemini'
    ).toLowerCase()
    return provider === 'ollama'
      ? this.createProvider('ollama', null)
      : this.createProvider('gemini', null)
  }

  private createProvider(
    id: LlmProviderId,
    shopConfig?: ShopLlmConfig | null,
  ): LlmProvider | null {
    const apiKey = this.resolveApiKey(id, shopConfig)

    switch (id) {
      case 'openai':
        if (!apiKey) return null
        return new OpenAICompatibleProvider({ id: 'openai', apiKey, isPaid: true })

      case 'groq':
        if (!apiKey) return null
        return new OpenAICompatibleProvider({
          id: 'groq',
          apiKey,
          baseURL: 'https://api.groq.com/openai/v1',
          isPaid: false,
        })

      case 'ollama': {
        const rawBase = process.env.OLLAMA_BASE_URL
        if (!rawBase) return null
        const trimmed = rawBase.replace(/\/+$/, '')
        const baseURL = trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
        return new OpenAICompatibleProvider({ id: 'ollama', baseURL, isPaid: false })
      }

      case 'gemini':
        if (!apiKey) return null
        return new GeminiProvider({ apiKey, isPaid: false })

      default:
        return null
    }
  }

  private resolveApiKey(
    id: LlmProviderId,
    shopConfig?: ShopLlmConfig | null,
  ): string | undefined {
    if (shopConfig?.llmApiKeyEnc) {
      try {
        return decryptSecret(shopConfig.llmApiKeyEnc)
      } catch {
        // Corrupt override: fall through to the shared env key.
      }
    }

    switch (id) {
      case 'openai':
        return process.env.OPENAI_API_KEY || undefined
      case 'gemini':
        return process.env.GEMINI_API_KEY || undefined
      case 'groq':
        return process.env.GROQ_API_KEY || undefined
      default:
        return undefined
    }
  }
}

function toProviderId(value: string | undefined): LlmProviderId | null {
  const v = (value || '').toLowerCase()
  return v === 'openai' || v === 'gemini' || v === 'groq' || v === 'ollama'
    ? v
    : null
}
