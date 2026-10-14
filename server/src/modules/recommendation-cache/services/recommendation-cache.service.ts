import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { getRedis } from '@/modules/chat/services/redis.client'

const CACHE_KEY_PREFIX = 'recommendation:theme:v1'
const GENERATION_KEY_PREFIX = 'recommendation:theme:generation:v1'
const CACHE_TTL_SECONDS = 60
const LOCK_TTL_MILLISECONDS = 5_000
const LOCK_WAIT_MILLISECONDS = 50
const LOCK_WAIT_ATTEMPTS = Math.ceil(
  LOCK_TTL_MILLISECONDS / LOCK_WAIT_MILLISECONDS,
)
const LOCK_RELEASE_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'

export type RecommendationProduct = {
  id: string
  url: string
  avatarSource: string | null
  name: string
  handle: string | null
  status: string | null
  price: number | null
  compareAtPrice: number | null
  currencyCode: string | null
}

export type RecommendationSnapshot = {
  id: number
  name: string
  products: RecommendationProduct[]
}

export const RECOMMENDATION_REDIS_CLIENT = Symbol('RECOMMENDATION_REDIS_CLIENT')

export interface RecommendationRedisClient {
  get(key: string): Promise<string | null>
  increment(key: string): Promise<number>
  setEx(key: string, value: string, seconds: number): Promise<string | null>
  setLock(
    key: string,
    value: string,
    milliseconds: number,
  ): Promise<string | null>
  releaseLock(key: string, value: string): Promise<void>
}

interface RecommendationRedisConnection {
  get(key: string): Promise<string | null>
  incr(key: string): Promise<number>
  set(
    key: string,
    value: string,
    mode: 'EX' | 'PX',
    duration: number,
    condition?: 'NX',
  ): Promise<string | null>
  eval(
    script: string,
    keyCount: number,
    key: string,
    value: string,
  ): Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSafeProductUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isSafeHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isNullableSafeHttpUrl(value: unknown): value is string | null {
  return value === null || isSafeHttpUrl(value)
}

function isRecommendationProduct(
  value: unknown,
): value is RecommendationProduct {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    /^[1-9]\d*$/.test(value.id) &&
    isSafeProductUrl(value.url) &&
    isNullableSafeHttpUrl(value.avatarSource) &&
    isNonEmptyString(value.name) &&
    isNullableString(value.handle) &&
    isNullableString(value.status) &&
    (value.price === null ||
      (typeof value.price === 'number' && Number.isFinite(value.price))) &&
    (value.compareAtPrice === null ||
      (typeof value.compareAtPrice === 'number' &&
        Number.isFinite(value.compareAtPrice))) &&
    isNullableString(value.currencyCode)
  )
}

function isRecommendationSnapshot(
  value: unknown,
): value is RecommendationSnapshot {
  if (!isRecord(value) || !Array.isArray(value.products)) return false

  return (
    typeof value.id === 'number' &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    isNonEmptyString(value.name) &&
    value.products.every(isRecommendationProduct)
  )
}

export function createRecommendationRedisClient(
  connection: RecommendationRedisConnection = getRedis(),
): RecommendationRedisClient {
  return {
    get: (key) => connection.get(key),
    increment: (key) => connection.incr(key),
    setEx: (key, value, seconds) => connection.set(key, value, 'EX', seconds),
    setLock: (key, value, milliseconds) =>
      connection.set(key, value, 'PX', milliseconds, 'NX'),
    releaseLock: async (key, value) => {
      await connection.eval(LOCK_RELEASE_SCRIPT, 1, key, value)
    },
  }
}

type CacheReadResult = {
  available: boolean
  value: RecommendationSnapshot | null
}

type GenerationReadResult = {
  available: boolean
  generation: number | null
}

type RecommendationLoader = () => Promise<RecommendationSnapshot>

@Injectable()
export class RecommendationCacheService {
  private readonly inFlight = new Map<string, Promise<RecommendationSnapshot>>()

  constructor(
    @Inject(RECOMMENDATION_REDIS_CLIENT)
    private readonly redis: RecommendationRedisClient,
  ) {}

  async getOrLoad(
    shop: string,
    offerId: number,
    pageType: string,
    limit: number,
    loader: RecommendationLoader,
  ): Promise<RecommendationSnapshot> {
    const generationResult = await this.readGeneration(shop, offerId)
    const requestKey = this.requestKey(
      shop,
      offerId,
      pageType,
      limit,
      generationResult,
    )
    const current = this.inFlight.get(requestKey)
    if (current) return current

    const request = this.loadRequest(
      shop,
      offerId,
      pageType,
      limit,
      generationResult,
      loader,
    ).finally(() => {
      if (this.inFlight.get(requestKey) === request) {
        this.inFlight.delete(requestKey)
      }
    })
    this.inFlight.set(requestKey, request)
    return request
  }

  async invalidateCampaign(shop: string, offerId: number): Promise<void> {
    try {
      await this.redis.increment(this.generationKey(shop, offerId))
    } catch (error) {
      console.error(`[recommendation-cache] invalidation failed: ${error}`)
    }
  }

  async invalidateCampaigns(shop: string, offerIds: number[]): Promise<void> {
    await Promise.all(
      [...new Set(offerIds)].map((offerId) =>
        this.invalidateCampaign(shop, offerId),
      ),
    )
  }

  private async loadRequest(
    shop: string,
    offerId: number,
    pageType: string,
    limit: number,
    generationResult: GenerationReadResult,
    loader: RecommendationLoader,
  ): Promise<RecommendationSnapshot> {
    if (generationResult.generation === null) return loader()

    const key = this.cacheKey(
      shop,
      offerId,
      pageType,
      limit,
      generationResult.generation,
    )
    return this.loadWithCache(
      key,
      shop,
      offerId,
      generationResult.generation,
      loader,
    )
  }

  private async readGeneration(
    shop: string,
    offerId: number,
  ): Promise<GenerationReadResult> {
    try {
      const value = await this.redis.get(this.generationKey(shop, offerId))
      if (value === null) return { available: true, generation: 0 }
      if (!/^(0|[1-9]\d*)$/.test(value)) {
        return { available: true, generation: null }
      }

      const generation = Number(value)
      return Number.isSafeInteger(generation)
        ? { available: true, generation }
        : { available: true, generation: null }
    } catch (error) {
      console.error(`[recommendation-cache] generation read failed: ${error}`)
      return { available: false, generation: null }
    }
  }

  private async loadWithCache(
    key: string,
    shop: string,
    offerId: number,
    generation: number,
    loader: RecommendationLoader,
  ): Promise<RecommendationSnapshot> {
    const cached = await this.read(key)
    if (cached.value) return cached.value
    if (!cached.available) return loader()

    const lockToken = randomUUID()
    const lockResult = await this.acquireLock(key, lockToken)
    if (lockResult === null) return loader()

    if (lockResult) {
      return this.loadAsLockOwner(
        key,
        shop,
        offerId,
        generation,
        lockToken,
        loader,
      )
    }

    for (let attempt = 0; attempt < LOCK_WAIT_ATTEMPTS; attempt += 1) {
      await this.delay(LOCK_WAIT_MILLISECONDS)
      const refreshed = await this.read(key)
      if (refreshed.value) return refreshed.value
      if (!refreshed.available) return loader()

      const retryToken = randomUUID()
      const retryResult = await this.acquireLock(key, retryToken)
      if (retryResult === null) return loader()
      if (retryResult) {
        return this.loadAsLockOwner(
          key,
          shop,
          offerId,
          generation,
          retryToken,
          loader,
        )
      }
    }

    return loader()
  }

  private async loadAsLockOwner(
    key: string,
    shop: string,
    offerId: number,
    generation: number,
    lockToken: string,
    loader: RecommendationLoader,
  ): Promise<RecommendationSnapshot> {
    try {
      const refreshed = await this.read(key)
      if (refreshed.value) return refreshed.value
      return await this.loadAndCache(key, shop, offerId, generation, loader)
    } finally {
      await this.releaseLock(key, lockToken)
    }
  }

  private async loadAndCache(
    key: string,
    shop: string,
    offerId: number,
    generation: number,
    loader: RecommendationLoader,
  ): Promise<RecommendationSnapshot> {
    const snapshot = await loader()
    const currentGeneration = await this.readGeneration(shop, offerId)
    if (currentGeneration.generation !== generation) return snapshot

    try {
      await this.redis.setEx(key, JSON.stringify(snapshot), CACHE_TTL_SECONDS)
    } catch (error) {
      console.error(`[recommendation-cache] write failed: ${error}`)
    }
    return snapshot
  }

  private async read(key: string): Promise<CacheReadResult> {
    let raw: string | null
    try {
      raw = await this.redis.get(key)
    } catch (error) {
      console.error(`[recommendation-cache] read failed: ${error}`)
      return { available: false, value: null }
    }

    if (!raw) return { available: true, value: null }

    try {
      const parsed: unknown = JSON.parse(raw)
      return {
        available: true,
        value: isRecommendationSnapshot(parsed) ? parsed : null,
      }
    } catch (error) {
      console.error(`[recommendation-cache] malformed payload: ${error}`)
      return { available: true, value: null }
    }
  }

  private async acquireLock(
    key: string,
    token: string,
  ): Promise<boolean | null> {
    try {
      const result = await this.redis.setLock(
        `${key}:lock`,
        token,
        LOCK_TTL_MILLISECONDS,
      )
      return result === 'OK'
    } catch (error) {
      console.error(`[recommendation-cache] lock failed: ${error}`)
      return null
    }
  }

  private async releaseLock(key: string, token: string): Promise<void> {
    try {
      await this.redis.releaseLock(`${key}:lock`, token)
    } catch (error) {
      console.error(`[recommendation-cache] lock release failed: ${error}`)
    }
  }

  private requestKey(
    shop: string,
    offerId: number,
    pageType: string,
    limit: number,
    generationResult: GenerationReadResult,
  ): string {
    const generation = generationResult.generation
    const generationKey = generation === null ? 'degraded' : `g${generation}`
    return `${this.normalizeShop(shop)}:${offerId}:${pageType}:${limit}:${generationKey}`
  }

  private cacheKey(
    shop: string,
    offerId: number,
    pageType: string,
    limit: number,
    generation: number,
  ): string {
    return `${CACHE_KEY_PREFIX}:${this.normalizeShop(shop)}:${offerId}:${pageType}:${limit}:g${generation}`
  }

  private generationKey(shop: string, offerId: number): string {
    return `${GENERATION_KEY_PREFIX}:${this.normalizeShop(shop)}:${offerId}`
  }

  private normalizeShop(shop: string): string {
    return encodeURIComponent(shop.trim().toLowerCase())
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
  }
}
