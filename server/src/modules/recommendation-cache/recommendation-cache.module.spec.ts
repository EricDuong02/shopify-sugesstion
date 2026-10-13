import { Test } from '@nestjs/testing'
import {
  RecommendationCacheService,
  RecommendationRedisClient,
  RECOMMENDATION_REDIS_CLIENT,
} from './services/recommendation-cache.service'
import { RecommendationCacheModule } from './recommendation-cache.module'

const redisClient: RecommendationRedisClient = {
  get: jest.fn().mockResolvedValue(null),
  increment: jest.fn().mockResolvedValue(1),
  setEx: jest.fn().mockResolvedValue('OK'),
  setLock: jest.fn().mockResolvedValue('OK'),
  releaseLock: jest.fn().mockResolvedValue(undefined),
}

describe('RecommendationCacheModule', () => {
  it('resolves the cache service with an injected Redis client', async () => {
    const module = await Test.createTestingModule({
      imports: [RecommendationCacheModule],
    })
      .overrideProvider(RECOMMENDATION_REDIS_CLIENT)
      .useValue(redisClient)
      .compile()

    expect(module.get(RecommendationCacheService)).toBeInstanceOf(
      RecommendationCacheService,
    )

    await module.close()
  })
})
