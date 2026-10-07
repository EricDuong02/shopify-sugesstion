import { Injectable, Optional } from '@nestjs/common'
import { ShopifyService } from '@/shared/services/shopify.service'

@Injectable()
export class ProductService {
  constructor(@Optional() private readonly shopify?: ShopifyService) {}

  fetchProducts(session: any) {
    return this.shopify.api.rest.Product.all({
      session,
    })
  }

  async fetchProductsGQL(gqlClient) {
    const products = await gqlClient.query({
      data: `{
          products (first: 10) {
            edges {
              node {
                id
                title
                descriptionHtml
              }
            }
          }
        }`,
    })

    return products.body
  }
}
