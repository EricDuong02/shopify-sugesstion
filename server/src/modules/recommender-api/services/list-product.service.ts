import { LIMIT_DEFAULT } from '@/const/utils'
import { Product } from '@/types/Recommend'
import { Injectable } from '@nestjs/common'
import { GraphqlClient } from '@shopify/shopify-api'
import { ProductCount } from './product-count.service'
import { RecommenderApiService } from './recommender-shopifyql.service'

@Injectable()
export class ListProductService {
  recommenderApiService: RecommenderApiService
  productCount: ProductCount
  constructor() {
    this.recommenderApiService = new RecommenderApiService()
    this.productCount = new ProductCount()
  }

  mergeLists(list1: Product[], list2: Product[]) {
    const mergedList = [...list1, ...list2]
    return mergedList.filter(
      (item, index, self) => index === self.findIndex((t) => t.id === item.id),
    )
  }

  async countProduct(
    gqlClient: GraphqlClient,
    typeId: string[],
    rules: {
      id: number
      column: number
      relation: number
      value: string[]
      productGroupsId: number | null
      updatedAt: Date
      createdAt: Date
    }[],
  ) {
    const listCount = []
    if (typeId.includes('3')) {
      for (const rule of rules) {
        switch (rule.column) {
          case 0:
            listCount.push({
              id: rule.id,
              column: rule.column,
              count: 1,
            })
            break
          case 1:
            const countDate = await this.productCount.countCreatedDate(
              gqlClient,
              rule.value[0],
              rule.relation,
            )
            listCount.push({
              id: rule.id,
              column: rule.column,
              count: countDate,
            })
            break
          case 2:
            listCount.push({
              id: rule.id,
              column: rule.column,
              count: await this.productCount.countProductsForSales(),
            })
            break

          case 3:
            listCount.push({
              id: rule.id,
              column: rule.column,
              count: await this.productCount.countProductsForSales(),
            })
            break
          case 4:
            listCount.push({
              id: rule.id,
              column: rule.column,
              count: await this.productCount.countProductsCategory(
                gqlClient,
                rule.value,
                rule.relation,
              ),
            })
            break
          case 5:
            listCount.push({
              id: rule.id,
              column: rule.column,
              count: await this.productCount.countProductsVendor(
                gqlClient,
                rule.value,
                rule.relation,
              ),
            })
            break
          case 6:
            listCount.push({
              id: rule.id,
              column: rule.column,
              count: await this.productCount.countDiscount(),
            })
            break
          case 7:
            listCount.push({
              id: rule.id,
              column: rule.column,
              count: await this.productCount.countSalesDate(
                gqlClient,
                rule.value,
                rule.relation,
              ),
            })
            break
          case 8:
            listCount.push({
              id: rule.id,
              column: rule.column,
              count: 250,
            })
            break
          case 9:
            listCount.push({
              id: rule.id,
              column: rule.column,
              count: 250,
            })
            break
        }
      }
    }
    return listCount
  }

  async getDataByCondition(
    gqlClient: GraphqlClient,
    limitProduct: number,
    typeId: string[],
    rules: {
      id: number
      column: number
      relation: number
      value: string[]
      productGroupsId: number | null
      updatedAt: Date
      createdAt: Date
    }[],
  ) {
    const limit = limitProduct || LIMIT_DEFAULT

    if (rules[0]?.value.length == 0 || typeId.length == 0) {
      return []
    }
    let combinedLists: Product[] = []
    let endCursor = null
    let hasNextPage = true
    if (typeId.includes('3')) {
      while (combinedLists.length < limit && hasNextPage) {
        for (const [index, rule] of rules.entries()) {
          switch (rule.column) {
            case 0:
              const listSku = await this.recommenderApiService.fetchSku(
                gqlClient,
                rule.value,
                rule.relation,
                index === 0 ? endCursor : null,
                index === 0 ? hasNextPage : true,
                combinedLists,
              )
              if (listSku.length === 0) {
                return [] // Stop loop when not have product satisfied
              }

              combinedLists =
                //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
                combinedLists.length > 0
                  ? combinedLists.filter((itemA) =>
                      listSku.some((itemB) => itemA.id === itemB.id),
                    )
                  : listSku
              break
            case 1:
              const listCreateDate =
                await this.recommenderApiService.fetchCreatedDate(
                  gqlClient,
                  rule.value[0],
                  rule.relation,
                  index === 0 ? endCursor : null,
                  index === 0 ? hasNextPage : true,
                  limit,
                  combinedLists,
                )
              if (listCreateDate.data.length === 0) {
                return [] // Stop loop when not have product satisfied
              }

              if (index === 0) {
                endCursor = listCreateDate.endCursor
                hasNextPage = listCreateDate.hasNextPage
              }

              combinedLists =
                //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
                combinedLists.length > 0
                  ? combinedLists.filter((itemA) =>
                      listCreateDate.data.some(
                        (itemB) => itemA.id === itemB.id,
                      ),
                    )
                  : listCreateDate.data
              break

            case 2:
              const listHandleSales =
                await this.recommenderApiService.fetchProductsForSales(
                  gqlClient,
                  +rule.value[0],
                  rule.relation,
                  index === 0 ? endCursor : null,
                  index === 0 ? hasNextPage : true,
                  limit,
                  combinedLists,
                )

              if (listHandleSales.data.length === 0) {
                return [] // Stop loop when not have product satisfied
              }

              if (index === 0) {
                endCursor = listHandleSales.endCursor
                hasNextPage = listHandleSales.hasNextPage
              }

              combinedLists =
                //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
                combinedLists.length > 0
                  ? combinedLists.filter((itemA) =>
                      listHandleSales.data.some(
                        (itemB) => itemA.id === itemB.id,
                      ),
                    )
                  : listHandleSales.data
              break

            case 3:
              const listHandleSold =
                await this.recommenderApiService.fetchProductsForSales(
                  gqlClient,
                  +rule.value[0],
                  rule.relation,
                  index === 0 ? endCursor : null,
                  index === 0 ? hasNextPage : true,
                  limit,
                  combinedLists,
                )
              if (listHandleSold.data.length === 0) {
                return [] // Stop loop when not have product satisfied
              }

              if (index === 0) {
                endCursor = listHandleSold.endCursor
                hasNextPage = listHandleSold.hasNextPage
              }

              combinedLists =
                //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
                combinedLists.length > 0
                  ? combinedLists.filter((itemA) =>
                      listHandleSold.data.some(
                        (itemB) => itemA.id === itemB.id,
                      ),
                    )
                  : listHandleSold.data
              break

            case 4:
              const listCollection =
                await this.recommenderApiService.getDataCollection(
                  gqlClient,
                  rule.value,
                  rule.relation,
                  index === 0 ? endCursor : null,
                  index === 0 ? hasNextPage : true,
                  limit,
                  combinedLists,
                )

              if (listCollection.data.length === 0) {
                return [] // Stop loop when not have product satisfied
              }

              if (index === 0) {
                endCursor = listCollection.endCursor
                hasNextPage = listCollection.hasNextPage
              }

              combinedLists =
                //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
                combinedLists.length > 0
                  ? combinedLists.filter((itemA) =>
                      listCollection.data.some(
                        (itemB) => itemA.id === itemB.id,
                      ),
                    )
                  : listCollection.data
              break

            case 5:
              const listBrand = await this.recommenderApiService.getDataBranch(
                gqlClient,
                rule.value,
                rule.relation,
                index === 0 ? endCursor : null,
                index === 0 ? hasNextPage : true,
                limit,
                combinedLists,
              )

              if (listBrand.data.length === 0) {
                return [] // Stop loop when not have product satisfied
              }

              if (index === 0) {
                endCursor = listBrand.endCursor
                hasNextPage = listBrand.hasNextPage
              }

              combinedLists =
                //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
                combinedLists.length > 0
                  ? combinedLists.filter((itemA) =>
                      listBrand.data.some((itemB) => itemA.id === itemB.id),
                    )
                  : listBrand.data
              break
            case 6:
              const listDiscountRange =
                combinedLists.length > 0
                  ? await this.recommenderApiService.getDataDiscount(
                      gqlClient,
                      rule.value,
                      rule.relation,
                      index === 0 ? endCursor : null,
                      index === 0 ? hasNextPage : true,
                      limit,
                      combinedLists,
                    )
                  : await this.recommenderApiService.fetchDiscountedProducts(
                      gqlClient,
                      rule.value,
                      rule.relation,
                      index === 0 ? endCursor : null,
                      index === 0 ? hasNextPage : true,
                      limit,
                    )

              if (listDiscountRange.data.length === 0) {
                return [] // Stop loop when not have product satisfied
              }

              if (index === 0) {
                endCursor = listDiscountRange.endCursor
                hasNextPage = listDiscountRange.hasNextPage
              }

              combinedLists =
                //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
                combinedLists.length > 0
                  ? combinedLists.filter((itemA) =>
                      listDiscountRange.data.some(
                        (itemB) => itemA.id === itemB.id,
                      ),
                    )
                  : listDiscountRange.data
              break
            case 7:
              const listSalesDate =
                await this.recommenderApiService.getDataSalesDate(
                  gqlClient,
                  rule.value[0],
                  rule.relation,
                  index === 0 ? endCursor : null,
                  index === 0 ? hasNextPage : true,
                  limit,
                  combinedLists,
                )

              if (listSalesDate.data.length === 0) {
                return [] // Stop loop when not have product satisfied
              }

              if (index === 0) {
                endCursor = listSalesDate.endCursor
                hasNextPage = listSalesDate.hasNextPage
              }
              combinedLists =
                //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
                combinedLists.length > 0
                  ? combinedLists.filter((itemA) =>
                      listSalesDate.data.some((itemB) => itemA.id === itemB.id),
                    )
                  : listSalesDate.data
              break
            case 8:
              const listProductImpression =
                await this.recommenderApiService.getProductImpression(
                  gqlClient,
                  rule.value[0],
                  rule.relation,
                  index === 0 ? endCursor : null,
                  index === 0 ? hasNextPage : true,
                  limit,
                  combinedLists,
                )

              if (listProductImpression.data.length === 0) {
                return [] // Stop loop when not have product satisfied
              }

              if (index === 0) {
                endCursor = listDiscountRange.endCursor
                hasNextPage = listDiscountRange.hasNextPage
              }

              combinedLists =
                //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
                combinedLists.length > 0
                  ? combinedLists.filter((itemA) =>
                      listProductImpression.data.some(
                        (itemB) => itemA.id === itemB.id,
                      ),
                    )
                  : listProductImpression.data
              break
            case 9:
              const listAddToCartRate =
                await this.recommenderApiService.getAddToCartRate(
                  gqlClient,
                  rule.value[0],
                  rule.relation,
                  limit,
                  combinedLists,
                )

              if (listAddToCartRate.length === 0) {
                return [] // Stop loop when not have product satisfied
              }

              combinedLists =
                //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
                combinedLists.length > 0
                  ? combinedLists.filter((itemA) =>
                      listAddToCartRate.some((itemB) => itemA.id === itemB.id),
                    )
                  : listAddToCartRate
              break
          }
        }
      }
    }

    if (typeId.includes('1')) {
      for (const rule of rules) {
        switch (rule.column) {
          case 13:
            //TODO need update logic
            // const purchaseWithLastPurchased =
            //   await this.recommenderApiService.fetchPurchaseWithLastPurchased(
            //     gqlClient,
            //     query.customerId, //TODO need change to customer Id
            //     combinedLists,
            //   )

            // if (purchaseWithLastPurchased.length === 0) {
            //   return [] // Stop loop when not have product satisfied
            // }

            // combinedLists =
            //   //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
            //   combinedLists.length > 0
            //     ? combinedLists.filter((itemA) =>
            //         purchaseWithLastPurchased.some(
            //           (itemB) => itemA.id === itemB.id,
            //         ),
            //       )
            //     : purchaseWithLastPurchased
            break
          case 14:
            const bundleDeals =
              await this.recommenderApiService.fetchBundleDeals(gqlClient)

            if (bundleDeals.length === 0) {
              return [] // Stop loop when not have product satisfied
            }

            combinedLists =
              //check combinedLists.length > 0 because first time combinedLists = [] can insert value to filter data
              combinedLists.length > 0
                ? combinedLists.filter((itemA) =>
                    bundleDeals.some((itemB) => itemA.id === itemB.id),
                  )
                : bundleDeals
            break
        }
      }
    }

    return combinedLists.slice(0, limit)
  }
}
