import { Module } from '@nestjs/common'
import {
  createRecommendationRedisClient,
  RecommendationCacheService,
  RECOMMENDATION_REDIS_CLIENT,
} from './services/recommendation-cache.service'

@Module({
  providers: [
    RecommendationCacheService,
    {
      provide: RECOMMENDATION_REDIS_CLIENT,
      useFactory: createRecommendationRedisClient,
    },
  ],
  exports: [RecommendationCacheService],
})
export class RecommendationCacheModule {}
