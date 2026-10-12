import { BullModule } from '@nestjs/bullmq'
import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import {
  CATALOG_SYNC_QUEUE,
  CatalogSyncService,
} from './services/catalog-sync.service'
import { LlmRegistryService } from '../chat/llm/llm-registry.service'
import { CatalogSyncProcessor } from './services/catalog-sync.processor'

/**
 * Owns Shopify product catalog synchronization and the semantic product index.
 * This module is intentionally not chat-specific: chat, webhooks, and future
 * recommender enrichment all consume the same synced catalog.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
    }),
    BullModule.registerQueue({ name: CATALOG_SYNC_QUEUE }),
  ],
  providers: [CatalogSyncService, CatalogSyncProcessor, LlmRegistryService],
  exports: [CatalogSyncService],
})
export class CatalogModule {}
