import { Controller, Get } from '@nestjs/common'
import { ProductService } from './product.service'
import { ShopSession } from '@/decorators/shop-session.decorator'
import { ShopClient } from '@/decorators/shop-client.decorator'

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  async fetchProducts(@ShopSession() session) {
    const products = await this.productService.fetchProducts(session)
    return products?.data || []
  }

  @Get('gql')
  async fetchProductsGQL(@ShopClient('gql') gqlClient) {
    const products = await this.productService.fetchProductsGQL(gqlClient)
    return products.products.edges || []
  }
}
