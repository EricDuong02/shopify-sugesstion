import { Module } from '@nestjs/common'
import { RecommenderApiController } from './controller/recommender-api.controller'
import { RecommenderApiService } from './services/recommender-api.service'
import { ListProductService } from './services/list-product.service'
import { ProductCount } from './services/product-count.service'
import { RecommenderApiService as RecommenderShopifyQlService } from './services/recommender-shopifyql.service'
import { RecommendationCacheModule } from '../recommendation-cache/recommendation-cache.module'

@Module({
  controllers: [RecommenderApiController],
  imports: [RecommendationCacheModule],
  providers: [
    RecommenderApiService,
    ListProductService,
    ProductCount,
    RecommenderShopifyQlService,
  ],
  exports: [ListProductService],
})
export class RecommenderApiModule {}
