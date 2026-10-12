import { Injectable, NotFoundException } from '@nestjs/common'
import '@shopify/shopify-api/adapters/node'
import { GraphqlClient, RestClient, Session } from '@shopify/shopify-api'
import { PrismaService } from './prisma.service'

import shopify from '@/lib/shopify-app'

@Injectable()
export class ShopifyService {
  readonly shopifyApp: typeof shopify

  constructor(private readonly prisma: PrismaService) {
    this.shopifyApp = shopify
  }

  getRestClient(session): RestClient {
    return new this.shopifyApp.api.clients.Rest({ session })
  }

  getGQLClient(session): GraphqlClient {
    return new this.shopifyApp.api.clients.Graphql({ session })
  }

  async getClientForShop(shop: string, apiType: 'rest' | 'gql' = 'gql') {
    const session = await this.getOfflineSession(shop)
    return apiType === 'rest'
      ? this.getRestClient(session)
      : this.getGQLClient(session)
  }

  async getOfflineSession(shop: string): Promise<Session> {
    const shopDomain = normalizeShopDomain(shop)
    const records = await this.prisma.appSession.findMany({
      where: { shop: shopDomain },
    })
    const record = records.find((candidate) => {
      const payload = candidate.payload as {
        isOnline?: boolean
        accessToken?: string
      } | null
      return payload?.isOnline === false && Boolean(payload.accessToken)
    })

    if (!record) {
      throw new NotFoundException(
        `Offline session not found for shop ${shopDomain}.`,
      )
    }

    const payload = record.payload as {
      accessToken: string
      scope?: string
      state?: string
      expires?: string | Date
    }

    return new Session({
      id: record.id,
      shop: shopDomain,
      state: payload.state ?? 'storefront-recommender',
      isOnline: false,
      accessToken: payload.accessToken,
      scope: payload.scope,
      expires: payload.expires ? new Date(payload.expires) : undefined,
    })
  }

  get app() {
    return this.shopifyApp
  }

  get api() {
    return this.shopifyApp.api
  }
}

function normalizeShopDomain(shop: string): string {
  const normalized = shop.trim().toLowerCase()
  if (!normalized.endsWith('.myshopify.com')) {
    throw new NotFoundException('Invalid shop domain.')
  }
  return normalized
}
