import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ChatAdminController } from './admin/chat-admin.controller'
import { ChatController } from './controller/chat.controller'
import { LlmRegistryService } from './llm/llm-registry.service'
import { CatalogSyncProcessor } from './services/catalog-sync.processor'
import {
  CatalogSyncService,
  CATALOG_SYNC_QUEUE,
} from './services/catalog-sync.service'
import { ChatService } from './services/chat.service'
import { ModelVerificationService } from './services/model-verification.service'
import { RateLimitService } from './services/rate-limit.service'
import { RetrievalService } from './services/retrieval.service'
import { ShopAuthGuard } from './admin/shop-auth.guard'

@Module({
  imports: [
    ConfigModule,
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
    }),
    BullModule.registerQueue({ name: CATALOG_SYNC_QUEUE }),
  ],
  controllers: [ChatController, ChatAdminController],
  providers: [
    ChatService,
    LlmRegistryService,
    RateLimitService,
    RetrievalService,
    CatalogSyncService,
    CatalogSyncProcessor,
    ShopAuthGuard,
    ModelVerificationService,
  ],
  exports: [ChatService, LlmRegistryService, CatalogSyncService],
})
export class ChatModule {}
