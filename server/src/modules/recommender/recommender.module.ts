import { Module } from '@nestjs/common'
import { RecommenderController } from './controller/recommender.controller'
import { RecommenderService } from './services/recommender.service'
import { RecommenderApiModule } from '../recommender-api/recommender-api.module'

@Module({
  imports: [RecommenderApiModule],
  controllers: [RecommenderController],
  providers: [RecommenderService],
})
export class RecommenderModule {}
