import { Module } from '@nestjs/common'
import { RecommenderController } from './controller/recommender.controller'
import { RecommenderService } from './services/recommender.service'
import { RecommenderApiModule } from '../recommender-api/recommender-api.module'
import { CatalogModule } from '../catalog/catalog.module'
import { RecommendationCacheModule } from '../recommendation-cache/recommendation-cache.module'

@Module({
  imports: [RecommenderApiModule, CatalogModule, RecommendationCacheModule],
  controllers: [RecommenderController],
  providers: [RecommenderService],
})
export class RecommenderModule {}
