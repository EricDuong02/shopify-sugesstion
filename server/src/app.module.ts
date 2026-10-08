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

// Devtools is a debug-only module. It opens its own HTTP port, so a
// hardcoded port makes every second Nest instance crash with EADDRINUSE,
// including orphaned processes left behind by a killed dev session. The
// port is configurable via DEVTOOLS_PORT (defaults to 5434), and the
// module is not registered at all when NODE_ENV is production.
function resolveDevtoolsPort(): number {
  const parsed = parseInt(process.env.DEVTOOLS_PORT ?? '', 10)
  return Number.isNaN(parsed) ? 5434 : parsed
}

const devtoolsImports =
  process.env.NODE_ENV === 'production'
    ? []
    : [
        DevtoolsModule.register({
          http: true,
          port: resolveDevtoolsPort(),
        }),
      ]

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
