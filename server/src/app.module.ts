import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DevtoolsModule } from '@nestjs/devtools-integration'
import { AuthMiddleware } from './middleware/middleware' // Import middleware
import { RecommenderApiController } from './modules/recommender-api/controller/recommender-api.controller'
import { SharedModule } from './shared/shared.module'
import { WebhooksModule } from './modules/webhooks/webhooks.module'
import { ProductModule } from './modules/product/product.module'
import { RecommenderModule } from './modules/recommender/recommender.module'
import { RecommenderApiModule } from './modules/recommender-api/recommender-api.module'
import { TokenModule } from './modules/token/token.module'

@Module({
  imports: [
    DevtoolsModule.register({
      http: process.env.NODE_ENV !== 'production',
      port: 5434,
    }),
    ConfigModule.forRoot(),
    SharedModule,
    WebhooksModule,
    ProductModule,
    RecommenderModule,
    RecommenderApiModule,
    TokenModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(RecommenderApiController)
  }
}
