import { ShopifyServer, ShopifyShop } from '@/decorators/shop-server.decorator'
import { Controller, Get, Query } from '@nestjs/common'
import { GraphqlClient } from '@shopify/shopify-api'
import { RecommendDto, RecommendListDto } from '../dtos/recommends.dto'
import { RecommenderApiService } from '../services/recommender-api.service'

@Controller({
  path: 'recommender-api',
  version: '1',
})
export class RecommenderApiController {
  constructor(private readonly recommenderApiService: RecommenderApiService) {}

  @Get('recommends')
  async fetchListProduct(
    @ShopifyServer('gql') gqlClient: GraphqlClient,
    @ShopifyShop() shop: string,
    @Query() query: RecommendDto,
  ) {
    if (!query) {
      throw new Error('Fail to fetch recommend')
    }
    const dataOfferProduct = await this.recommenderApiService.getData(
      gqlClient,
      query,
      shop,
    )

    return {
      id: dataOfferProduct.id,
      name: dataOfferProduct.name,
      products: dataOfferProduct.products.map((data) => ({
        id: data.id,
        handle: data.handle,
      })),
    }
  }

  @Get('recommends-app')
  async fetchListProductForApp(
    @ShopifyShop() shop: string,
    @Query() query: RecommendDto,
  ) {
    if (!query) {
      throw new Error('Fail to fetch recommend')
    }
    const dataOfferProduct = await this.recommenderApiService.getPersistedData(
      query,
      shop,
    )

    return dataOfferProduct.products
  }

  @Get('recommends/list')
  async fetchListRecommend(
    @ShopifyShop() shop: string,
    @Query() query: RecommendListDto,
  ) {
    const pageType = query.pageType
    const limit = query.limit
    const search = query.search || undefined
    const listIds = query.ids || undefined

    const dataCondition = this.recommenderApiService.getManyData(
      pageType,
      +limit,
      search,
      listIds,
      shop,
    )
    return dataCondition
  }

  @Get('active-users')
  async getActiveUsers() {
    // return await this.recommenderApiService.getActiveUsers()
  }
}
