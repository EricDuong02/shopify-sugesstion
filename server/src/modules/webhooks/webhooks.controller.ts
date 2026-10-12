import { Controller, HttpCode, Optional, Post, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { PrismaService } from '@/shared/services/prisma.service'
import { ShopifyService } from '@/shared/services/shopify.service'
import { CatalogSyncService } from '../catalog/services/catalog-sync.service'

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly shopify: ShopifyService,
    @Optional() private readonly catalogSync: CatalogSyncService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // validate() checks the HMAC signature. On success it returns
      // { valid: true, topic, domain, ... }, otherwise { valid: false, reason }
      const data: any = await this.shopify.api.webhooks.validate({
        rawBody: req.body,
        rawRequest: req,
        rawResponse: res,
      })

      if (!data.valid) {
        res.status(401).send('Invalid webhook signature')
        return
      }

      console.log(`Webhook validated: topic=${data.topic} shop=${data.domain}`)

      switch (data.topic) {
        case 'APP_UNINSTALLED':
          // Shop uninstalled the app: drop its sessions so a reinstall starts clean
          await this.prisma.appSession.deleteMany({
            where: { shop: data.domain },
          })
          console.log(`Deleted sessions for uninstalled shop ${data.domain}`)
          break
        case 'SCOPES_UPDATE':
          console.log(`Scopes updated for shop ${data.domain}`)
          break
        case 'PRODUCTS_CREATE':
        case 'PRODUCTS_UPDATE':
          await this.handleProductUpsert(data.domain, req.body)
          break
        case 'PRODUCTS_DELETE':
          await this.handleProductDelete(data.domain, req.body)
          break
        default:
          console.log(`Unhandled webhook topic: ${data.topic}`)
      }

      res.status(200).send('OK')
    } catch (error) {
      console.error('[webhooks] error processing webhook:', error)
      res.status(400).send('Webhook error')
    }
  }

  private async handleProductUpsert(
    domain: string,
    rawBody: any,
  ): Promise<void> {
    const productId = extractProductIdFromBody(rawBody)
    if (!domain || !productId) return
    if (!this.catalogSync) {
      console.warn('[webhooks] CatalogSyncService unavailable, skipping sync')
      return
    }
    await this.catalogSync.enqueueProductSync(domain, productId)
  }

  private async handleProductDelete(
    domain: string,
    rawBody: any,
  ): Promise<void> {
    const productId = extractProductIdFromBody(rawBody)
    if (!domain || !productId) return
    if (!this.catalogSync) {
      console.warn('[webhooks] CatalogSyncService unavailable, skipping delete')
      return
    }
    await this.catalogSync.deleteProduct(domain, productId)
  }
}

/**
 * The raw body is a Buffer here because HMAC validation needs the exact
 * bytes Shopify signed, so parse it defensively instead of assuming an
 * object.
 */
function extractProductIdFromBody(rawBody: any): string | null {
  try {
    const text =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : JSON.stringify(rawBody)
    const body = JSON.parse(text)
    return body?.id != null ? String(body.id) : null
  } catch {
    return null
  }
}
