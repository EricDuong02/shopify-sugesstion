import { Injectable } from '@nestjs/common'
import { getRedis } from './redis.client'

/** Price per 1M tokens, used to enforce the paid-fallback budget cap. */
const MODEL_PRICING_USD_PER_1M: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
  'gemini-1.5-flash': { in: 0.075, out: 0.3 },
  'llama-3.3-70b-versatile': { in: 0.59, out: 0.79 },
}

/** Conservative fallback pricing for unknown paid models. */
const UNKNOWN_MODEL_PRICING = { in: 0.5, out: 1.5 }

export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const pricing = MODEL_PRICING_USD_PER_1M[model] ?? UNKNOWN_MODEL_PRICING
  return (
    (tokensIn / 1_000_000) * pricing.in + (tokensOut / 1_000_000) * pricing.out
  )
}

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

@Injectable()
export class RateLimitService {
  /** Fixed-window rate limit. Fails open when Redis is unavailable. */
  async checkLimit(key: string, limitPerMin: number): Promise<boolean> {
    try {
      const redis = getRedis()
      const window = Math.floor(Date.now() / 60000)
      const redisKey = `chat:rl:${key}:${window}`
      const count = await redis.incr(redisKey)
      if (count === 1) await redis.expire(redisKey, 70)
      return count <= limitPerMin
    } catch (error) {
      console.error(`[ratelimit] check failed, allowing request: ${error}`)
      return true
    }
  }

  async getDailySpendUsd(shopId: string): Promise<number> {
    try {
      const val = await getRedis().get(`chat:spend:${shopId}:${dayKey()}`)
      return val ? parseFloat(val) : 0
    } catch {
      return 0
    }
  }

  async addSpendUsd(shopId: string, usd: number): Promise<void> {
    if (!(usd > 0)) return
    try {
      const redis = getRedis()
      const key = `chat:spend:${shopId}:${dayKey()}`
      await redis.incrbyfloat(key, usd)
      await redis.expire(key, 2 * 86400)
    } catch (error) {
      console.error(`[ratelimit] spend tracking failed: ${error}`)
    }
  }
}
