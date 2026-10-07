import { Injectable, Optional } from '@nestjs/common'
import '@shopify/shopify-api/adapters/node'
import { GraphqlClient } from '@shopify/shopify-api'
import { RestClient } from '@shopify/shopify-api/dist/ts/lib/clients/admin/rest/client'

import shopify from '@/lib/shopify-app'
import { PrismaService } from './prisma.service'

@Injectable()
export class ShopifyService {
  shopifyApp: typeof shopify

  constructor(@Optional() public readonly prisma?: PrismaService) {
    this.shopifyApp = shopify
  }

  getRestClient(session): RestClient {
    return new this.shopifyApp.api.clients.Rest({ session })
  }

  getGQLClient(session): GraphqlClient {
    return new this.shopifyApp.api.clients.Graphql({ session })
  }

  get app() {
    return this.shopifyApp
  }

  get api() {
    return this.shopifyApp.api
  }
}
