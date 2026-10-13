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
import { ChatModule } from './modules/chat/chat.module'
import { CatalogModule } from './modules/catalog/catalog.module'

const DEVTOOLS_DEFAULT_PORT = 5434

function resolveDevtoolsPort(): number {
  const parsed = parseInt(process.env.DEVTOOLS_PORT ?? '', 10)
  return Number.isNaN(parsed) ? DEVTOOLS_DEFAULT_PORT : parsed
}

const devtoolsEnabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.DEVTOOLS_ENABLED === 'true'

const devtoolsImports = devtoolsEnabled
  ? [
      DevtoolsModule.register({
        http: true,
        port: resolveDevtoolsPort(),
      }),
    ]
  : []

@Module({
  imports: [
    ...devtoolsImports,
    ConfigModule.forRoot(),
    SharedModule,
    WebhooksModule,
    ProductModule,
    RecommenderModule,
    RecommenderApiModule,
    TokenModule,
    CatalogModule,
    ChatModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(RecommenderApiController)
  }
}
