import Redis from 'ioredis'

let client: Redis | null = null

/**
 * Shared Redis client (rate limiting, spend tracking, BullMQ).
 * Callers must tolerate Redis being unavailable: the helpers built on
 * top of this client fail open so chat keeps working without Redis.
 */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    })
    client.on('error', (err) => {
      console.error(`[redis] ${err.message}`)
    })
  }
  return client
}
