import { ShopClient } from '@/decorators/shop-client.decorator'
import { ShopSession } from '@/decorators/shop-session.decorator'
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common'
import { RecommenderService } from '../services/recommender.service'
import { listAttribute, listConditions, pageOptions } from '@/data'
import { FetchProductsQueryDto } from 'src/modules/recommender/dtos/fetch-products-query.dto'
import { CreateProductRecommenderDto } from 'src/modules/recommender/dtos/create-product-recommender.dto'
import { UpdateProductRecommenderDto } from 'src/modules/recommender/dtos/update-product-recommender.dto'
import { GetData } from 'src/modules/recommender/dtos/get-data.dto'
import { GetDetail } from 'src/modules/recommender/dtos/get-detail.dto'
import { GraphqlClient } from '@shopify/shopify-api'
import { RecommendDto } from '../dtos/recommends.dto'

@Controller({
  path: 'recommender',
  version: '1',
})
export class RecommenderController {
  constructor(private readonly recommenderService: RecommenderService) {}

  @Get('all')
  async fetchProductsGQL(
    @ShopClient('gql') gqlClient: GraphqlClient,
    @Query() query: FetchProductsQueryDto,
  ) {
    const products = await this.recommenderService.fetchProductsGQL(
      gqlClient,
      query,
    )
    return products.data || []
  }

  @Get('brand-vendor')
  async fetchBrand(@ShopClient('gql') gqlClient: GraphqlClient) {
    let hasNextPage = true
    const vendorCount = {}
    let afterCursor = ''
    while (hasNextPage) {
      const data = await this.recommenderService.fetchBrandsGQLByVendor(
        gqlClient,
        afterCursor,
      )
      const newVendors = data.data.products.edges.map(
        (edge) => edge.node.vendor,
      )
      newVendors.forEach((vendor) => {
        if (vendor) {
          vendorCount[vendor] = (vendorCount[vendor] || 0) + 1
        }
      })

      hasNextPage = data.data.products.pageInfo.hasNextPage
      if (hasNextPage) {
        afterCursor =
          data.data.products.edges[data.data.products.edges.length - 1].cursor
      }
    }

    const resultArray = Object.entries(vendorCount).map(([brand, value]) => ({
      value: brand,
      label: brand,
      count: value,
    }))

    return resultArray || []
  }

  @Get('category')
  async fetchBrandsByCollection(@ShopClient('gql') gqlClient: GraphqlClient) {
    const category =
      await this.recommenderService.fetchCategoryGQLByCollection(gqlClient)
    return category.data || []
  }

  @Post('create')
  async submitData(
    @ShopClient('gql') gqlClient: GraphqlClient,
    @ShopSession() session,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: CreateProductRecommenderDto,
  ) {
    const data = await this.recommenderService.createData(
      gqlClient,
      session.shop,
      body,
    )
    return data
  }

  @Post('update')
  async updateData(
    @ShopClient('gql') gqlClient: GraphqlClient,
    @ShopSession() session,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: UpdateProductRecommenderDto,
  ) {
    const data = await this.recommenderService.updateData(
      gqlClient,
      session.shop,
      body,
    )
    return data
  }

  @Get('data')
  async getData(
    @ShopClient('gql') gqlClient: GraphqlClient,
    @ShopSession() session,
    @Query() query: GetData,
  ) {
    const data = await this.recommenderService.getData(session.shop, query)

    const remakeData = await Promise.all(
      data.map(async (data) => {
        const updatedProductGroups = await Promise.all(
          data.triggerProduct.productGroups.map(async (group) => {
            const updatedRules = await Promise.all(
              group.rules.map(async (rule) => {
                if (rule.column === 4) {
                  const title = await this.recommenderService.getNameCategory(
                    gqlClient,
                    rule.value,
                  )
                  return { ...rule, value: title }
                }
                return rule
              }),
            )

            return {
              ...group,
              rules: updatedRules,
            }
          }),
        )

        return {
          ...data,
          triggerProduct: {
            ...data.triggerProduct,
            productGroups: updatedProductGroups,
          },
        }
      }),
    )

    const dataFinal = remakeData.map((data) => {
      return {
        id: data.id,
        name: data.name,
        trigger: data.triggerProduct.pageIds
          .map(
            (id) =>
              pageOptions.find((option) => option.value === String(id))?.label,
          )
          .filter(Boolean)
          .join(', '),
        condition: data.triggerProduct.productGroups
          .map((data) => {
            return data.rules
              .map((rule) => {
                return `${listAttribute.find((attribute) => +attribute.value == rule.column)?.label} ${listConditions.find((condition) => +condition.value == rule.relation)?.label} ${rule.value.join(', ')}`
              })
              .join(', ')
          })
          .join(', '),
        active: data.triggerProduct.scheduleOn,
        products: data.products,
      }
    })

    return dataFinal
  }
  @Get('detail')
  async getDetail(@ShopSession() session, @Query() query: GetDetail) {
    const data = await this.recommenderService.getData(session.shop, query)

    return data
  }

  @Post('listProduct')
  async getListProduct(
    @ShopClient('gql') gqlClient,
    @Body() body: { ids: string[] },
  ) {
    const listId = body.ids
    const data = await this.recommenderService.getListProduct(gqlClient, listId)

    return data
  }

  @Get('recommends')
  async fetchListProduct(@ShopSession() session, @Query() query: RecommendDto) {
    if (!query) {
      throw new Error('Fail to fetch recommend')
    }
    const dataOfferProduct = await this.recommenderService.getFirstData(
      session.shop,
      query,
    )
    if (!dataOfferProduct || !dataOfferProduct.products) {
      return []
    }

    return dataOfferProduct.products
  }
}
