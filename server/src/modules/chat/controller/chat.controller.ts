import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { ChatService } from '../services/chat.service'

/**
 * Public storefront endpoints for the chat widget.
 * These are intentionally NOT behind the Shopify auth middleware:
 * storefront visitors are unauthenticated. Protection comes from the
 * per-shop public token, per-shop+IP rate limiting, and the paid
 * fallback budget cap (see ChatService).
 */
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** Public widget bootstrap config (contains no secrets). */
  @Get('config')
  async getConfig(@Query('shop') shop: string) {
    return this.chatService.getPublicConfig(shop)
  }

  /** Server-sent events stream of chat progress. */
  @Post('messages/stream')
  @HttpCode(200)
  async streamMessage(
    @Body() rawBody: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // The widget posts text/plain to avoid a CORS preflight probe, so the
    // body arrives as a string and is decoded here. Malformed JSON falls
    // back to an empty object, which fails publicToken validation below.
    let body: {
      shop?: string
      publicToken?: string
      sessionId?: string
      message?: string
    }
    try {
      body =
        typeof rawBody === 'string'
          ? (JSON.parse(rawBody) as typeof body)
          : ((rawBody ?? {}) as typeof body)
    } catch {
      body = {}
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const forwarded = req.headers['x-forwarded-for']
    const clientIp =
      (Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded?.split(',')[0]?.trim()) || req.ip

    try {
      for await (const event of this.chatService.streamChat({
        shop: body.shop ?? '',
        publicToken: body.publicToken ?? '',
        sessionId: body.sessionId,
        message: body.message ?? '',
        clientIp,
      })) {
        if (res.writableEnded) break
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      }
    } catch {
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            message: 'Stream failed',
          })}\n\n`,
        )
      }
    } finally {
      if (!res.writableEnded) res.end()
    }
  }
}
