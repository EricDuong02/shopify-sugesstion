import { Module } from '@nestjs/common'
import { RecommenderApiController } from './controller/recommender-api.controller'
import { RecommenderApiService } from './services/recommender-api.service'

@Module({
  controllers: [RecommenderApiController],
  providers: [RecommenderApiService],
})
export class RecommenderApiModule {}
