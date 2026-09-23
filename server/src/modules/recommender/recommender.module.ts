import { Module } from '@nestjs/common'
import { RecommenderController } from './controller/recommender.controller'
import { RecommenderService } from './services/recommender.service'

@Module({
  controllers: [RecommenderController],
  providers: [RecommenderService],
})
export class RecommenderModule {}
