import { Controller, Optional, Post, Req, Res } from '@nestjs/common'
import { Request } from 'express'
import { PrismaClient } from '@prisma/client'
import { ShopifyService } from '@/shared/services/shopify.service'

const prisma = new PrismaClient()

/**
 * POST /api/webhooks
 *
 * Webhooks are handled directly in NestJS (no handlers are registered in
 * server/src/lib/shopify-app.ts), so we validate the HMAC here and dispatch
 * on the topic ourselves. We intentionally do NOT call
 * api.webhooks.process(), because it throws
 * "No HTTP webhooks registered for topic ..." when no handlers exist
 * in the shopify-api webhook registry.
 *
 * Test with:
 * yarn shopify webhook trigger --topic app/uninstalled --address /api/webhooks
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(@Optional() private readonly shopify?: ShopifyService) {}

  @Post()
  async webhooks(@Res() res, @Req() req: Request) {
    try {
      // validate() checks the HMAC signature. On success it returns
      // { valid: true, topic, domain, ... }, otherwise { valid: false, reason }
      const data: any = await this.shopify.api.webhooks.validate({
        rawBody: req.body,
        rawRequest: req,
        rawResponse: res,
      })

      if (!data.valid) {
        console.log(`Invalid webhook: ${data.reason ?? 'unknown reason'}`)
        if (!res.headersSent) res.status(401).send('Invalid webhook')
        return
      }

      console.log(`Webhook validated: topic=${data.topic} shop=${data.domain}`)

      switch (data.topic) {
        case 'APP_UNINSTALLED':
          // Shop uninstalled the app: drop its sessions so a reinstall starts clean
          await prisma.appSession.deleteMany({ where: { shop: data.domain } })
          console.log(`Deleted sessions for uninstalled shop ${data.domain}`)
          break
        case 'SCOPES_UPDATE':
          console.log(`Scopes updated for shop ${data.domain}`)
          break
        default:
          console.log(`Unhandled webhook topic: ${data.topic}`)
      }

      if (!res.headersSent) res.status(200).send()
      console.log('Webhook processed, returned status code 200')
    } catch (e) {
      console.log(`Failed to process webhook: ${e.message}`)
      if (!res.headersSent) {
        res.status(400).send(e.message)
      }
    }
  }
}