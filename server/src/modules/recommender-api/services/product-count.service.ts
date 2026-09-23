import { MAX_QUERY_NUMBER } from '@/const/utils'
import { Injectable } from '@nestjs/common'
import { GraphqlClient } from '@shopify/shopify-api'

@Injectable()
export class ProductCount {
  async countCreatedDate(
    gqlClient: GraphqlClient,
    date: string,
    relation: number,
  ) {
    const conditionDate =
      relation == 2 ? `created_at:<=${date}` : `created_at:>=${date}`

    const createQuery = () => {
      return `{
        productsCount(query: "${conditionDate}") {
            count
        }
    }`
    }

    const query = createQuery()

    const count = await gqlClient.query<{
      data: {
        productsCount: {
          count: number
        }
      }
    }>({
      data: query,
    })

    return count.body.data.productsCount.count || 0
  }

  async countProductsForSales() {
    //TODO shopify admin ql not supporting check quantity sold and sale price
    return MAX_QUERY_NUMBER
  }

  async countProductsCategory(
    gqlClient: GraphqlClient,
    collectionIds: string[],
    relation: number,
  ) {
    const queryIds = collectionIds.map((id) => `id:${id}`).join(' OR')

    // Initialize an array to hold counts
    let totalProductsCount = 0
    let hasNextPage = true
    let cursor: string | null = null

    while (hasNextPage) {
      // Create the query with pagination
      const createQuery = () => {
        return `{
            collections(first: ${250}${queryIds ? `, query: "${queryIds}"` : ``}${cursor ? `, after: "${cursor}"` : ``}) {
                edges {
                    node {
                        productsCount {
                        count
                        }
                    }
                }
                pageInfo {
                hasNextPage
                endCursor
                }
            }
        }`
      }

      const query = createQuery()

      const response = await gqlClient.query<{
        data: {
          collections: {
            edges: Array<{
              node: {
                productsCount: { count: number }
              }
            }>
            pageInfo: {
              hasNextPage: boolean
              endCursor: string | null
            }
          }
        }
      }>({
        data: query,
      })

      // Extract the count for the current page
      const edges = response.body.data.collections.edges
      for (const edge of edges) {
        totalProductsCount += edge.node.productsCount.count
      }

      // Check if there are more pages
      const pageInfo = response.body.data.collections.pageInfo
      hasNextPage = pageInfo.hasNextPage
      cursor = pageInfo.endCursor // Update the cursor for the next request
    }

    // return totalProductsCount
    if (relation === 3) {
      return totalProductsCount
    }
    const countAllProduct = await gqlClient.query<{
      data: {
        productsCount: { count: number }
      }
    }>({
      data: `{
            productsCount {
                count
            }
        }`,
    })
    return (
      countAllProduct.body.data.productsCount.count - totalProductsCount || 0
    )
  }

  async countProductsVendor(
    gqlClient: GraphqlClient,
    listBrand: string[],
    relation: number,
  ) {
    const queryIds = listBrand.map((branch) => `vendor:${branch}`).join(' OR ')

    // Initialize an array to hold counts
    const createQuery = () => {
      return `{
            productsCount(query: "vendor:${queryIds}") {
                count
            }
        }`
    }

    const query = createQuery()

    const response = await gqlClient.query<{
      data: {
        productsCount: { count: number }
      }
    }>({
      data: query,
    })

    // return totalProductsCount
    if (relation === 4) {
      return response.body.data.productsCount.count || 0
    }
    const countAllProduct = await gqlClient.query<{
      data: {
        productsCount: { count: number }
      }
    }>({
      data: `{
            productsCount {
                count
            }
        }`,
    })
    return (
      countAllProduct.body.data.productsCount.count -
        response.body.data.productsCount.count || 0
    )
  }

  async countDiscount() {
    return MAX_QUERY_NUMBER + 1000
  }

  async countSalesDate(
    gqlClient: GraphqlClient,
    value: string[],
    relation: number,
  ) {
    let hasNextPage = true
    let endCursor = null
    let total = 0

    const timeLimit = (() => {
      switch (relation) {
        case 1:
          return `created_at:>=${new Date(value[0]).toISOString().slice(0, 13)}`
        case 2:
          return `created_at:<=${new Date(value[0]).toISOString().slice(0, 13)}`
        default:
          return undefined
      }
    })()

    while (hasNextPage) {
      const result = await gqlClient.query<{
        data: {
          orders: {
            edges: Array<{
              node: {
                subtotalLineItemsQuantity: number
              }
            }>
            pageInfo: {
              hasNextPage: boolean
              endCursor: string
            }
          }
        }
      }>({
        data: `{
        orders(first: ${100}${endCursor ? `, after: "${endCursor}"` : ''}${timeLimit ? ` ,query: "${timeLimit}` : ''}") {
          edges {
            node {
              subtotalLineItemsQuantity
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      })

      result.body.data.orders.edges.forEach((order) => {
        total += order.node.subtotalLineItemsQuantity
      })

      hasNextPage = result.body.data.orders.pageInfo.hasNextPage
      endCursor = result.body.data.orders.pageInfo.endCursor
    }

    return total
  }
}
