import { ShopifyServer, ShopifyShop } from '@/decorators/shop-server.decorator'
import { Controller, Get, Header, Query, ValidationPipe } from '@nestjs/common'
import { GraphqlClient } from '@shopify/shopify-api'
import { RecommendDto, RecommendListDto } from '../dtos/recommends.dto'
import { ThemeCampaignsDto } from '../dtos/theme-campaigns.dto'
import { ThemeRecommendationDto } from '../dtos/theme-recommendation.dto'
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

  @Get('theme')
  @Header('Cache-Control', 'private, no-store')
  async fetchThemeRecommendation(
    @ShopifyShop() shop: string,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: ThemeRecommendationDto,
  ) {
    const { id, pageType, limit, productLimit } = query
    if (!id) {
      return this.recommenderApiService.getThemeCampaigns(
        { pageType, limit, productLimit },
        shop,
      )
    }

    return this.recommenderApiService.getThemeData(
      { id, pageType, limit },
      shop,
    )
  }

  @Get('theme/campaigns')
  @Header('Cache-Control', 'private, no-store')
  async fetchThemeCampaigns(
    @ShopifyShop() shop: string,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: ThemeCampaignsDto,
  ) {
    const { pageType, limit, productLimit } = query
    return this.recommenderApiService.getThemeCampaignList(
      { pageType, limit, productLimit },
      shop,
    )
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
