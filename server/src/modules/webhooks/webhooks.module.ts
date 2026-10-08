import { Module } from '@nestjs/common'
import { ChatModule } from '../chat/chat.module'
import { WebhooksController } from './webhooks.controller'

@Module({
  imports: [ChatModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
