import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ChatAdminController } from './admin/chat-admin.controller'
import { ShopAuthGuard } from './admin/shop-auth.guard'
import { ChatController } from './controller/chat.controller'
import { LlmRegistryService } from './llm/llm-registry.service'
import { ChatService } from './services/chat.service'
import { ModelVerificationService } from './services/model-verification.service'
import { RateLimitService } from './services/rate-limit.service'
import { RetrievalService } from './services/retrieval.service'

@Module({
  imports: [ConfigModule],
  controllers: [ChatController, ChatAdminController],
  providers: [
    ChatService,
    LlmRegistryService,
    RateLimitService,
    RetrievalService,
    ShopAuthGuard,
    ModelVerificationService,
  ],
  exports: [ChatService, LlmRegistryService],
})
export class ChatModule {}
