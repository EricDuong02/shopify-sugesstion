import { MAX_QUERY_NUMBER } from '@/const/utils'
import { extractProductId } from '@/functions/extractProductId'
import {
  DataProductResponse,
  DataProductResponseWithPrice,
  DiscountQueryResponse,
  OrdersData,
  Product,
  ProductGql,
  ProductInCollectionsResponse,
  ShopifyOrdersQueryResponse,
  ShopifyOrdersQueryWithDateResponse,
} from '@/types/Recommend'
import { Injectable } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { GraphqlClient } from '@shopify/shopify-api'
import { GoogleAnalyst4 } from './googleAnalyst4.service'

@Injectable()
export class RecommenderApiService {
  prisma: PrismaClient
  googleAnalyst: GoogleAnalyst4
  constructor() {
    this.prisma = new PrismaClient()
    this.googleAnalyst = new GoogleAnalyst4()
  }

  async fetchSku(
    gqlClient: GraphqlClient,
    listIdSku: string[],
    relation: number,
    endCursorCondition: string | null,
    hasNextPageCondition: boolean,
    combinedLists: Product[],
    limit = MAX_QUERY_NUMBER,
  ): Promise<Product[]> {
    let allCollectionProducts: ProductGql[] = []
    const skuQuery = listIdSku.map((sku) => `sku:${sku}`).join(' OR ')
    const finalSkuQuery = relation == 3 ? skuQuery : `NOT (${skuQuery})`
    const productIdQuery = combinedLists
      .map((combinedLists) => `product_id:${combinedLists.id}`)
      .join(' OR ')

    const query = `
      query getProductIdsByVariantSKUs {
        productVariants(first: ${limit}${productIdQuery ? `, query: "${productIdQuery}${finalSkuQuery ? ` AND ${finalSkuQuery}` : ''}"` : `${finalSkuQuery ? `, query: "${finalSkuQuery}"` : ''}`}) {
          edges {
            node {
              product {
                id
                title
                handle
                status
                media(first: 1) {
                  edges {
                    node {
                      preview {
                        image {
                          url
                        }
                      }
                    }
                  }
                }
                onlineStorePreviewUrl
                priceRangeV2 {
                  maxVariantPrice {
                    amount
                  }
                }
              }
            }
          }
        }
      }
    `

    const data = await gqlClient.query<{
      data: {
        productVariants: {
          edges: [
            {
              node: {
                product: ProductGql
              }
            },
          ]
        }
      }
    }>({
      data: query,
    })
    const result = data.body

    if (!result || !result.data || !result.data.productVariants) {
      throw new Error('Failed to fetch collections')
    }

    result.data.productVariants.edges.forEach((productsEdge) => {
      allCollectionProducts = allCollectionProducts.concat(
        productsEdge.node.product,
      )
    })

    const uniqueProducts = allCollectionProducts.filter(
      (product, index, self) =>
        index === self.findIndex((p) => p.id === product.id),
    )

    return this.refactorData(uniqueProducts)
  }

  async fetchCreatedDate(
    gqlClient: GraphqlClient,
    value: string,
    relation: number,
    endCursorCondition: string | null,
    hasNextPageCondition: boolean,
    limit: number,
    combinedLists: Product[],
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    let allCollectionProducts: ProductGql[] = []

    const productIdQuery = combinedLists
      .map((combinedLists) => `id:${combinedLists.id}`)
      .join(' OR ')

    const today = new Date()
    const date = new Date(today)
    date.setDate(today.getDate() + Number(value))

    const conditionDate =
      relation == 2
        ? `created_at:<=${date.toISOString()}`
        : `created_at:>=${date.toISOString()}`

    const createQuery = (endCursor: string | null = null) => {
      return `{
      products(first: ${limit}, query: "${conditionDate} ${
        productIdQuery ? ` AND ${productIdQuery}` : ``
      }" ${endCursor ? `, after: "${endCursor}"` : ``}) {
        edges {
          node {
            id
            title
            handle
            status
            media(first: 1) {
              edges {
                node {
                  preview {
                    image {
                      url
                    }
                  }
                }
              }
            }
            onlineStorePreviewUrl
            priceRangeV2 {
              maxVariantPrice {
                amount
              }
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

    let hasNextPage = hasNextPageCondition
    let endCursor: string = endCursorCondition

    while (hasNextPage && allCollectionProducts.length < limit) {
      const query = createQuery(endCursor)

      const data = await gqlClient.query<{ data: DataProductResponse }>({
        data: query,
      })
      const result = data.body

      if (!result || !result.data || !result.data.products) {
        throw new Error('Failed to fetch collections')
      }

      result.data.products.edges.forEach((productsEdge) => {
        allCollectionProducts = allCollectionProducts.concat(productsEdge.node)
      })

      const pageInfo = result.data.products.pageInfo
      hasNextPage = pageInfo.hasNextPage

      // Stop if we've reached the limit
      if (allCollectionProducts.length >= limit) {
        hasNextPage = false
      }

      endCursor = pageInfo.endCursor
    }

    // Slice the result to ensure it doesn't exceed the limit
    return {
      endCursor: endCursor,
      hasNextPage: hasNextPage,
      data: this.refactorData(allCollectionProducts.slice(0, limit)),
    }
  }

  async fetchProductsForSales(
    gqlClient: GraphqlClient,
    minimumSales: number,
    relation: number,
    endCursorCondition: string | null,
    hasNextPageCondition: boolean,
    limit: number,
    combinedLists: Product[],
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    const productIdQuery = combinedLists
      .map((combinedLists) => `product_id:${combinedLists.id}`)
      .join(' OR ')
    let productsAboveThreshold: (Product & {
      totalSales: number
      totalSalesVolume: number
    })[] = []

    let hasNextPage = hasNextPageCondition
    let cursor: string | null = endCursorCondition
    try {
      while (hasNextPage && productsAboveThreshold.length < limit) {
        const data = await gqlClient.query<{
          data: ShopifyOrdersQueryResponse
        }>({
          data: `{
            orders(first: ${limit}, after: ${cursor}${productIdQuery ? `, query: "${productIdQuery}"` : ''}) {
              edges {
                node {
                  lineItems(first: ${limit}) {
                    edges {
                      node {
                        title
                        quantity
                        originalUnitPriceSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                        product {
                          id
                          title
                          handle
                          status
                          media(first: 1) {
                            edges {
                              node {
                                preview {
                                  image {
                                    url
                                  }
                                }
                              }
                            }
                          }
                          onlineStorePreviewUrl
                          priceRangeV2 {
                            maxVariantPrice {
                              amount
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }`,
        })
        if (!data.body) {
          console.error('Response body is undefined')
          return { endCursor: null, hasNextPage: false, data: [] }
        }

        const dataFinal = data.body.data

        const orders = dataFinal.orders.edges

        cursor = dataFinal.orders.pageInfo.endCursor
        hasNextPage = dataFinal.orders.pageInfo.hasNextPage

        orders.forEach((data) => {
          data.node.lineItems.edges.forEach((edge) => {
            const product = edge.node.product
            const productId = product.id

            const salesAmount =
              edge.node.quantity *
              +edge.node.originalUnitPriceSet.shopMoney.amount

            const existingProduct = productsAboveThreshold.find(
              (product) => product.id === productId,
            )
            if (existingProduct) {
              existingProduct.totalSales += salesAmount
              existingProduct.totalSalesVolume += edge.node.quantity
            } else if (product) {
              productsAboveThreshold.push({
                id: extractProductId(product.id),
                url: product.onlineStorePreviewUrl,
                avatarSource: product.media.edges[0]?.node.preview.image.url,
                handle: product.handle,
                name: product.title,
                status: product.status,
                price: +product.priceRangeV2.maxVariantPrice.amount,
                totalSales: salesAmount,
                totalSalesVolume: edge.node.quantity,
              })
            }
          })
        })
        if (relation == 1) {
          productsAboveThreshold = productsAboveThreshold.filter(
            (product) => product.totalSales >= minimumSales,
          )
        }
        if (relation == 2) {
          productsAboveThreshold = productsAboveThreshold.filter(
            (product) => product.totalSalesVolume >= minimumSales,
          )
        }
        // Stop if we've reached the limit
        if (productsAboveThreshold.length >= limit) {
          hasNextPage = false // Stop fetching more data if limit reached
        }
      }
    } catch (error) {
      console.error('Error fetching products for sales:', error)
      return { endCursor: null, hasNextPage: false, data: [] }
    }

    const dataReturn = productsAboveThreshold.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ totalSales, totalSalesVolume, ...rest }) => rest,
    )

    return { endCursor: cursor, hasNextPage: hasNextPage, data: dataReturn }
  }

  async getDataCollection(
    gqlClient: GraphqlClient,
    collectionIds: string[],
    relation: number,
    endCursorCondition: string | null,
    hasNextPage: boolean,
    limit: number,
    combinedLists: Product[],
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    const listProduct =
      relation == 4
        ? await this.fetchProductsNotInCollections(
            gqlClient,
            collectionIds,
            endCursorCondition,
            hasNextPage,
            limit,
            combinedLists,
          )
        : await this.fetchProductsInCollections(
            gqlClient,
            collectionIds,
            endCursorCondition,
            hasNextPage,
            limit,
            combinedLists,
          )

    return listProduct
  }

  async getDataBranch(
    gqlClient: GraphqlClient,
    listBrand: string[],
    relation: number,
    endCursorCondition: string | null,
    hasNextPage: boolean,
    limit: number,
    combinedLists: Product[],
  ) {
    const listProduct =
      relation == 4
        ? await this.fetchProductsNotInBrand(
            gqlClient,
            listBrand,
            endCursorCondition,
            hasNextPage,
            limit,
            combinedLists,
          )
        : await this.fetchProductsInBrand(
            gqlClient,
            listBrand,
            endCursorCondition,
            hasNextPage,
            limit,
            combinedLists,
          )

    return listProduct
  }

  async getDataDiscount(
    gqlClient: GraphqlClient,
    value: string[],
    relation: number,
    endCursorCondition: string | null,
    hasNextPageCondition: boolean,
    limit: number,
    combinedLists: Product[],
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    let allProducts: ProductGql[] = []
    let hasNextPage = hasNextPageCondition
    let endCursor = endCursorCondition

    const rangeDiscount = +value[0] / 100
    const productIdQuery = combinedLists
      .map((combinedList) => `id:${combinedList.id}`)
      .join(' OR ')

    while (hasNextPage && allProducts.length < limit) {
      const result = await gqlClient.query<{
        data: DataProductResponseWithPrice
      }>({
        data: `{
        products(first: 20${endCursor ? `, after: "${endCursor}"` : ''}${productIdQuery ? `, query: "${productIdQuery}"` : ''}) {
          edges {
            node {
              id
              title
              handle
              status
              media(first: 1) {
                edges {
                  node {
                    preview {
                      image {
                        url
                      }
                    }
                  }
                }
              }
              onlineStorePreviewUrl
              priceRangeV2 {
                maxVariantPrice {
                  amount
                }
              }
              compareAtPriceRange {
                maxVariantCompareAtPrice {
                  amount
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      })

      const products = result.body.data.products.edges

      const filteredProducts = products.filter((product) => {
        const maxCompareAtPrice =
          parseFloat(
            product.node.compareAtPriceRange?.maxVariantCompareAtPrice?.amount,
          ) || 0
        const maxPrice =
          parseFloat(product.node.priceRangeV2?.maxVariantPrice?.amount) || 0

        if (maxCompareAtPrice > 0 && maxPrice > 0) {
          const discountPercentage = 1 - maxPrice / maxCompareAtPrice
          return relation === 1
            ? discountPercentage >= rangeDiscount
            : discountPercentage <= rangeDiscount
        }
        return false
      })

      const dataFinal = filteredProducts.map((product) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { compareAtPriceRange, ...data } = product.node
        return data
      })

      allProducts = allProducts.concat(dataFinal)

      // Check if we have reached the limit
      if (allProducts.length >= limit) {
        break
      }

      // Update pagination variables
      hasNextPage = result.body.data.products.pageInfo.hasNextPage
      endCursor = result.body.data.products.pageInfo.endCursor
    }

    return {
      endCursor: endCursor || null,
      hasNextPage: hasNextPage,
      data: this.refactorData(allProducts),
    }
  }

  async fetchDiscountedProducts(
    gqlClient: GraphqlClient,
    value: string[],
    relation: number,
    endCursorCondition: string | null,
    hasNextPageCondition: boolean,
    limit: number,
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    let hasNextPage = hasNextPageCondition
    let endCursor = endCursorCondition
    const discountedProducts = []

    const createQuery = (endCursor: string | null = null) => {
      return `{
        discountNodes(first: 10${endCursor ? `, after: "${endCursor}"` : ``}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            discount {
              ... on DiscountCodeBasic {
                endsAt
                customerGets {
                  value {
                    ... on DiscountPercentage {
                      percentage
                    }
                  }
                  items {
                    ... on DiscountProducts {
                      products(first: 10) {
                        edges {
                          node {
                            id
                          }
                        }
                      }
                    }
                    ... on DiscountCollections {
                      collections(first: 10) {
                        edges {
                          node {
                            products(first: 10) {
                              edges {
                                node {
                                  id
                                  title
                                  handle
                                  status
                                  media(first: 1) {
                                    edges {
                                      node {
                                        preview {
                                          image {
                                            url
                                          }
                                        }
                                      }
                                    }
                                  }
                                  onlineStorePreviewUrl
                                  priceRangeV2 {
                                    maxVariantPrice {
                                      amount
                                    }
                                  }
                                  compareAtPriceRange {
                                    maxVariantCompareAtPrice {
                                      amount
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
              ... on DiscountCodeBxgy {
                endsAt
                customerGets {
                  items {
                    ... on DiscountProducts {
                      products(first: 10) {
                        edges {
                          node {
                            id
                          }
                        }
                      }
                    }
                    ... on DiscountCollections {
                      collections(first: 10) {
                        edges {
                          node {
                            products(first: 10) {
                              edges {
                                node {
                                  id
                                  title
                                  handle
                                  status
                                  media(first: 1) {
                                    edges {
                                      node {
                                        preview {
                                          image {
                                            url
                                          }
                                        }
                                      }
                                    }
                                  }
                                  onlineStorePreviewUrl
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                  value {
                    ... on DiscountPercentage {
                      __typename
                      percentage
                    }
                  }
                }
              }
            }
          }
        }}`
    }

    while (hasNextPage && discountedProducts.length < limit) {
      const query = createQuery(endCursor)

      const response = await gqlClient.query<{
        data: any
      }>({ data: query })
      const result = response.body

      if (!result || !result.data || !result.data.discountNodes) {
        throw new Error('Failed to fetch collections')
      }

      const discountNodes = result.data.discountNodes.nodes
      discountNodes.forEach((node) => {
        const percentage = node.discount.customerGets.value.percentage

        if (
          percentage &&
          (relation == 1
            ? percentage > +value[0] / 100
            : percentage < +value[0] / 100)
        ) {
          const item = node.discount.customerGets.items

          if (item?.collections.edges?.length) {
            item.collections.edges.forEach((collection) => {
              discountedProducts.push(
                ...collection.node.products.edges
                  .map((product) => product.node)
                  .filter(
                    (product) =>
                      !discountedProducts.some((p) => p.id === product.id),
                  ),
              )
            })
          }

          if (item?.products?.edges?.length > 0) {
            discountedProducts.push(
              ...item.products.edges
                .map((product) => product.node)
                .filter(
                  (product) =>
                    !discountedProducts.some((p) => p.id === product.id),
                ),
            )
          }
        }
      })

      // Update pagination info
      hasNextPage = result.data.discountNodes.pageInfo.hasNextPage
      endCursor = result.data.discountNodes.pageInfo.endCursor
    }

    return {
      endCursor: endCursor || null,
      hasNextPage: hasNextPage,
      data: this.refactorData(discountedProducts.slice(0, limit)),
    }
  }

  async getDataSalesDate(
    gqlClient: GraphqlClient,
    value: string,
    relation: number,
    endCursorCondition: string | null,
    hasNextPageCondition: boolean,
    limit: number,
    combinedLists: Product[],
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    let allProducts: ProductGql[] = []
    let hasNextPage = hasNextPageCondition
    let endCursor = endCursorCondition
    let collectedProductsCount = 0

    const productIdQuery = combinedLists
      .map((combinedLists) => `id:${combinedLists.id}`)
      .join(' OR ')

    const today = new Date()
    const date = new Date(today)
    date.setDate(today.getDate() + Number(value))
    const timeLimit = (() => {
      switch (relation) {
        case 1:
          return `created_at:>=${date.toISOString()}`
        case 2:
          return `created_at:<=${date.toISOString()}`
        default:
          return undefined
      }
    })()

    while (hasNextPage && collectedProductsCount < limit) {
      const result = await gqlClient.query<{
        data: ShopifyOrdersQueryWithDateResponse
      }>({
        data: `{
        orders(first: ${50}${endCursor ? `, after: "${endCursor}"` : ''}${productIdQuery ? `, query: "${productIdQuery}${timeLimit ? ` AND ${timeLimit}` : ''}"` : `${timeLimit ? ` ,query: "${timeLimit}` : ''}`}") {
          edges {
            node {
              lineItems(first: ${50}) {
                edges {
                  node {
                    product {
                      id
                      title
                      handle
                      status
                      media(first: 1) {
                        edges {
                          node {
                            preview {
                              image {
                                url
                              }
                            }
                          }
                        }
                      }
                      onlineStorePreviewUrl
                      priceRangeV2 {
                        maxVariantPrice {
                          amount
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      })

      const orders = result.body.data.orders.edges
      const productList = orders.flatMap((item) =>
        item.node.lineItems.edges.map((edge) => {
          return edge.node.product
        }),
      )

      // Removing duplicates if necessary
      const uniqueProductList = Array.from(
        new Map(productList.map((product) => [product.id, product])).values(),
      )

      allProducts = allProducts.concat(uniqueProductList)
      collectedProductsCount += uniqueProductList.length
      hasNextPage = result.body.data.orders.pageInfo.hasNextPage
      endCursor = result.body.data.orders.pageInfo.endCursor
      if (collectedProductsCount >= limit) {
        break
      }
    }

    return {
      endCursor: endCursor,
      hasNextPage: hasNextPage,
      data: this.refactorData(allProducts.slice(0, limit)),
    }
  }

  async getProductImpression(
    gqlClient: GraphqlClient,
    value: string,
    relation: number,
    endCursorCondition: string | null,
    hasNextPageCondition: boolean,
    limit: number,
    combinedLists: Product[],
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    const listProductId = await this.googleAnalyst.getViewSession(combinedLists)
    const listProductIdPassCondition = listProductId.filter((data) => {
      const itemsViewSession = Number(data.itemsViewSession)
      const thresholdValue = Number(value)

      return +relation === 1
        ? itemsViewSession > thresholdValue
        : itemsViewSession < thresholdValue
    })

    const productIdQuery = listProductIdPassCondition
      .map((product) => `id:${product.productId}`)
      .join(' OR ')
    let hasNextPage = hasNextPageCondition
    let endCursor = endCursorCondition
    let allCollectionProducts: ProductGql[] = []

    while (hasNextPage && allCollectionProducts.length < limit) {
      const result = await gqlClient.query<{ data: DataProductResponse }>({
        data: `{
        products(first: ${MAX_QUERY_NUMBER}${endCursor ? `, after: "${endCursor}"` : ''}${productIdQuery ? `, query: "${productIdQuery}"` : ''}) {
          edges {
            node {
              id
              title
              handle
              status
              media(first: 1) {
                edges {
                  node {
                    preview {
                      image {
                        url
                      }
                    }
                  }
                }
              }
              onlineStorePreviewUrl
              priceRangeV2 {
                maxVariantPrice {
                  amount
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      })

      result.body.data.products.edges.map((productEdge) => {
        if (allCollectionProducts.length < limit) {
          // Check limit before adding
          allCollectionProducts = allCollectionProducts.concat(productEdge.node)
        }
      })

      hasNextPage = result.body.data.products.pageInfo.hasNextPage
      endCursor = result.body.data.products.pageInfo.endCursor
    }

    return {
      endCursor: endCursor,
      hasNextPage: hasNextPage,
      data: this.refactorData(allCollectionProducts),
    }
  }

  async getAddToCartRate(
    gqlClient: GraphqlClient,
    value: string,
    relation: number,
    limit: number,
    combinedLists: Product[],
  ): Promise<Product[]> {
    const listProductId = await this.googleAnalyst.getAddToCart(combinedLists)
    const listProductIdPassCondition = listProductId.filter((data) => {
      const itemsViewSession = Number(data.cartRate)
      const thresholdValue = Number(value)

      return +relation === 1
        ? itemsViewSession > thresholdValue
        : itemsViewSession < thresholdValue
    })

    const productIdQuery = listProductIdPassCondition
      .map((product) => `id:${product.productId}`)
      .join(' OR ')
    let allProducts: ProductGql[] = []
    let hasNextPage = true
    let endCursor = null

    while (hasNextPage && allProducts.length < limit) {
      const result = await gqlClient.query<{ data: DataProductResponse }>({
        data: `{
        products(first: ${MAX_QUERY_NUMBER}${endCursor ? `, after: "${endCursor}"` : ''}${productIdQuery ? `, query: "${productIdQuery}"` : ''}) {
          edges {
            node {
              id
              title
              handle
              status
              media(first: 1) {
                edges {
                  node {
                    preview {
                      image {
                        url
                      }
                    }
                  }
                }
              }
              onlineStorePreviewUrl
              priceRangeV2 {
                maxVariantPrice {
                  amount
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      })

      const products = result.body.data.products.edges.map((edge) => edge.node)

      allProducts = allProducts.concat(products)

      hasNextPage = result.body.data.products.pageInfo.hasNextPage
      endCursor = result.body.data.products.pageInfo.endCursor
    }
    return this.refactorData(allProducts)
  }

  async fetchBundleDeals(gqlClient: GraphqlClient): Promise<Product[]> {
    const allCollectionProducts: ProductGql[] = []

    const createDiscountQuery = (endCursor: string | null = null) => `
    {
      discountNodes(first: ${MAX_QUERY_NUMBER}${endCursor ? `, after: "${endCursor}"` : ''}) {
        nodes {
          discount {
            ... on DiscountCodeBxgy {
              title
              endsAt
              customerBuys {
                items {
                  ... on DiscountProducts {
                    products(first: ${MAX_QUERY_NUMBER}) {
                      edges {
                        node {
                          id
                          title
                          handle
                          status
                          media(first: 1) {
                            edges {
                              node {
                                preview {
                                  image {
                                    url
                                  }
                                }
                              }
                            }
                          }
                          onlineStorePreviewUrl
                          priceRangeV2 {
                            maxVariantPrice {
                              amount
                            }
                          }
                        }
                      }
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                    }
                  }
                  ... on DiscountCollections {
                    collections(first: 30) {
                      edges {
                        node {
                          products(first: ${MAX_QUERY_NUMBER}) {
                            edges {
                              node {
                                id
                                title
                                handle
                                status
                                media(first: 1) {
                                  edges {
                                    node {
                                      preview {
                                        image {
                                          url
                                        }
                                      }
                                    }
                                  }
                                }
                                onlineStorePreviewUrl
                                priceRangeV2 {
                                  maxVariantPrice {
                                    amount
                                  }
                                }
                              }
                            }
                            pageInfo {
                              hasNextPage
                              endCursor
                            }
                          }
                        }
                      }
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                    }
                  }
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`

    const fetchDiscountNodes = async (endCursor: string | null = null) => {
      const query = createDiscountQuery(endCursor)
      const data = await gqlClient.query<{ data: DiscountQueryResponse }>({
        data: query,
      })
      const result = data.body?.data?.discountNodes

      if (!result) {
        throw new Error('Failed to fetch discount nodes')
      }

      return result
    }

    const processProducts = (products: { node: ProductGql }[]) => {
      products.forEach((productEdge) => {
        allCollectionProducts.push(productEdge.node)
      })
    }

    let hasNextPage = true
    let endCursor: string | null = null

    while (hasNextPage) {
      const result = await fetchDiscountNodes(endCursor)

      // Process discount nodes
      result.nodes.forEach((discountNode) => {
        if (
          discountNode.discount.customerBuys &&
          discountNode.discount.customerBuys?.items.products &&
          discountNode.discount.customerBuys?.items.products.edges
        ) {
          processProducts(
            discountNode.discount.customerBuys.items.products?.edges,
          )
        }

        if (
          discountNode.discount.customerBuys &&
          discountNode.discount.customerBuys?.items.collections &&
          discountNode.discount.customerBuys?.items.collections.edges
        ) {
          discountNode.discount.customerBuys?.items.collections.edges.forEach(
            (item) => {
              processProducts(item.node.products.edges)
            },
          )
        }
      })

      // Update pagination variables
      hasNextPage = result.pageInfo.hasNextPage
      endCursor = result.pageInfo.endCursor
    }

    // Remove any duplicates based on product id
    const uniqueProducts = Array.from(
      new Map(allCollectionProducts.map((item) => [item.id, item])).values(),
    )

    return this.refactorData(uniqueProducts)
  }

  async getData(query) {
    return this.prisma.offerProduct.findFirst({
      where: {
        id: +query.id || undefined,
      },
      include: {
        productGroups: {
          include: {
            rules: true,
          },
        },
        triggerProduct: {
          include: {
            productGroups: {
              include: {
                rules: true,
              },
            },
          },
        },
        fallBackProduct: {
          include: {
            productGroups: {
              include: {
                rules: true,
              },
            },
          },
        },
      },
    })
  }

  async getManyData(limit = 10) {
    const data = await this.prisma.offerProduct.findMany({
      take: limit,
    })

    return data.map((item) => ({
      id: item.id,
      name: item.name,
    }))
  }

  async fetchPurchaseWithLastPurchased(
    gqlClient: GraphqlClient,
    customerId: string,
    combinedLists: { id: string; title: string; handle: string }[],
  ) {
    if (!customerId) {
      return []
    }
    const allPurchasedProducts: {
      id: string
      title: string
      handle: string
    }[] = []

    const productIdQuery = combinedLists
      .map((item) => `product_id:${item.id}`)
      .join(' OR ')
    const conditionCustomer = `customer_id:${customerId}`

    const createQuery = (
      orderEndCursor: string | null = null,
      lineItemEndCursor: string | null = null,
    ) => {
      return `{
      orders(first: ${MAX_QUERY_NUMBER}, query: "${conditionCustomer} ${
        productIdQuery ? ` AND ${productIdQuery}` : ``
      }" ${orderEndCursor ? `, after: "${orderEndCursor}"` : ``}) {
        edges {
          node {
            id
            name
            lineItems(first: ${MAX_QUERY_NUMBER} ${lineItemEndCursor ? `, after: "${lineItemEndCursor}"` : ``}) {
              edges {
                node {
                  title
                  quantity
                  variant {
                    product {
                      id
                      title
                      handle
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
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

    let hasNextPageOrders = true
    let orderEndCursor: string | null = null

    // Loop to fetch paginated orders and lineItems in one query
    while (hasNextPageOrders) {
      const query = createQuery(orderEndCursor)
      const data = await gqlClient.query({ data: query })
      const result: OrdersData = data.body

      if (!result || !result.data || !result.data.orders) {
        throw new Error('Failed to fetch orders')
      }

      // Process each order
      for (const orderEdge of result.data.orders.edges) {
        let hasNextPageLineItems = true
        let lineItemEndCursor: string | null = null

        // Loop through lineItems until all are fetched for this order
        while (hasNextPageLineItems) {
          // If lineItems pagination is needed, fetch again with new lineItemEndCursor
          const lineItemsQuery = createQuery(orderEndCursor, lineItemEndCursor)
          const lineItemsData = await gqlClient.query({ data: lineItemsQuery })
          const lineItemsResult: OrdersData = lineItemsData.body

          if (
            !lineItemsResult ||
            !lineItemsResult.data ||
            !lineItemsResult.data.orders
          ) {
            throw new Error('Failed to fetch line items')
          }

          // Extract lineItems from the current order
          const order = lineItemsResult.data.orders.edges.find(
            (e) => e.node.id === orderEdge.node.id,
          )
          order.node.lineItems.edges.forEach((lineItemEdge) => {
            const product = lineItemEdge.node.variant.product
            allPurchasedProducts.push({
              id: product.id,
              title: product.title,
              handle: product.handle,
            })
          })

          // Pagination for line items
          const lineItemsPageInfo = order.node.lineItems.pageInfo
          hasNextPageLineItems = lineItemsPageInfo.hasNextPage
          lineItemEndCursor = lineItemsPageInfo.endCursor
        }
      }

      // Pagination for orders
      const ordersPageInfo = result.data.orders.pageInfo
      hasNextPageOrders = ordersPageInfo.hasNextPage
      orderEndCursor = ordersPageInfo.endCursor
    }

    return allPurchasedProducts.map((data) => ({
      id: extractProductId(data.id),
      title: data.title,
      handle: data.handle,
    }))
  }

  //Additional function list
  async fetchProductsInCollections(
    gqlClient: GraphqlClient,
    collectionIds: string[],
    endCursorCondition: string | null,
    hasNextPageCondition: boolean,
    limit: number,
    combinedLists: Product[],
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    const allCollectionProducts: ProductGql[] = []

    const queryIds = collectionIds.map((id) => `id:${id}`).join(' OR ')
    const productIdQuery = combinedLists
      .map((combinedList) => `product_id:${combinedList.id}`)
      .join(' OR ')

    const createCollectionQuery = (endCursor: string | null = null) => {
      return `{
      collections(first: ${collectionIds.length}${
        queryIds
          ? `, query: "${queryIds} ${productIdQuery ? `AND ${productIdQuery}` : ''}"`
          : `${productIdQuery ? `, query: "${productIdQuery}"` : ''}`
      }) {
        edges {
          node {
            id
            title
            handle
            products(first: ${limit}${endCursor ? `, after: "${endCursor}"` : ''}) {
              edges {
                node {
                  id
                  title
                  handle
                  status
                  media(first: 1) {
                    edges {
                      node {
                        preview {
                          image {
                            url
                          }
                        }
                      }
                    }
                  }
                  onlineStorePreviewUrl
                  priceRangeV2 {
                    maxVariantPrice {
                      amount
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    }`
    }

    let totalFetched = 0
    let hasNextPage = hasNextPageCondition
    let endCursor: string | null = endCursorCondition

    while (hasNextPage && totalFetched < limit) {
      const query = createCollectionQuery(endCursor)

      const response = await gqlClient.query<{
        data: ProductInCollectionsResponse
      }>({ data: query })

      const result = response.body
      if (!result || !result.data || !result.data.collections) {
        console.error('Failed to fetch collections')
        return { endCursor: null, hasNextPage: false, data: [] }
      }
      const collections = result.data.collections.edges

      for (const collection of collections) {
        const products = collection.node.products.edges

        for (const product of products) {
          if (totalFetched >= limit) {
            break // Stop if we've reached the limit
          }

          allCollectionProducts.push(product.node)
          totalFetched++
        }

        if (totalFetched >= limit) {
          break // Stop if we've reached the limit
        }
      }

      hasNextPage = collections.some(
        (collection) => collection.node.products.pageInfo.hasNextPage,
      )
      endCursor = collections.length
        ? collections[collections.length - 1].node.products.pageInfo.endCursor
        : null
    }

    return {
      endCursor: endCursor,
      hasNextPage: hasNextPage,
      data: this.refactorData(allCollectionProducts),
    }
  }

  async fetchAllCollectionIds(gqlClient: GraphqlClient): Promise<string[]> {
    const allCollectionIds: string[] = []
    let hasNextPage = true
    let endCursor: string | null = null

    const createQuery = (endCursor: string | null) => {
      return `{
      collections(first: 250${endCursor ? `, after: "${endCursor}"` : ''}) {
        edges {
          node {
            id
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`
    }

    while (hasNextPage) {
      const query = createQuery(endCursor)
      const response = await gqlClient.query<{
        data: {
          collections?: {
            edges: Array<{
              node: {
                id: string
              }
            }>
            pageInfo: {
              hasNextPage: boolean
              endCursor?: string
            }
          }
        }
      }>({ data: query })

      const result = response.body

      if (!result || !result.data || !result.data.collections) {
        throw new Error('Failed to fetch collections')
      }
      const collections = result.data.collections.edges

      // Collect the collection IDs
      collections.forEach((collection: { node: { id: string } }) => {
        allCollectionIds.push(collection.node.id)
      })

      // Check if more pages exist
      hasNextPage = result.data.collections.pageInfo.hasNextPage
      endCursor = result.data.collections.pageInfo.endCursor
    }

    return allCollectionIds
  }

  async fetchProductsNotInCollections(
    gqlClient: GraphqlClient,
    collectionIds: string[],
    endCursorCondition: string | null,
    hasNextPage: boolean,
    limit: number,
    combinedLists: Product[],
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    const allCollection = await this.fetchAllCollectionIds(gqlClient)

    const listOtherCollection = allCollection
      .map((collection) => collection.replace('gid://shopify/Collection/', ''))
      .filter((item) => !collectionIds.includes(item))

    return await this.fetchProductsInCollections(
      gqlClient,
      listOtherCollection,
      endCursorCondition,
      hasNextPage,
      limit,
      combinedLists,
    )
  }

  async fetchProductsInBrand(
    gqlClient: GraphqlClient,
    listBrand: string[],
    endCursorCondition: string | null,
    hasNextPageCondition: boolean,
    limit: number,
    combinedLists: Product[],
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    let allCollectionProducts: ProductGql[] = []
    const queryIds = listBrand.map((branch) => `vendor:${branch}`).join(' OR ')
    const productIdQuery = combinedLists
      .map((combinedLists) => `id:${combinedLists.id}`)
      .join(' OR ')

    const createQuery = (endCursor: string | null = null) => {
      return `{
      products(first: ${MAX_QUERY_NUMBER}, query: "${queryIds} ${
        productIdQuery ? `AND ${productIdQuery}` : ``
      }${endCursor ? `, after: "${endCursor}"` : ``}") {
        edges {
          node {
            id
            title
            handle
            status
            media(first: 1) {
              edges {
                node {
                  preview {
                    image {
                      url
                    }
                  }
                }
              }
            }
            onlineStorePreviewUrl
            priceRangeV2 {
              maxVariantPrice {
                amount
              }
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

    let hasNextPage = hasNextPageCondition
    let endCursor = endCursorCondition

    while (hasNextPage && allCollectionProducts.length < limit) {
      const query = createQuery(endCursor)

      const data = await gqlClient.query<{ data: DataProductResponse }>({
        data: query,
      })
      const result = data.body

      if (!result || !result.data || !result.data.products) {
        throw new Error('Failed to fetch collections')
      }

      result.data.products.edges.forEach((productEdge) => {
        if (allCollectionProducts.length < limit) {
          // Check limit before adding
          allCollectionProducts = allCollectionProducts.concat(productEdge.node)
        }
      })
      const pageInfo = result.data.products.pageInfo
      hasNextPage = pageInfo.hasNextPage
      endCursor = pageInfo.endCursor

      // If we've reached the limit, we can stop fetching more
      if (allCollectionProducts.length >= limit) {
        hasNextPage = false
      }
    }

    return {
      endCursor: endCursor,
      hasNextPage: hasNextPage,
      data: this.refactorData(allCollectionProducts),
    }
  }

  async fetchAllBrand(gqlClient: GraphqlClient) {
    const allVendorNames: string[] = []
    let hasNextPage = true
    let endCursor: string | null = null

    const createQuery = (endCursor: string | null) => {
      return `{
    products(first: 250${endCursor ? `, after: "${endCursor}"` : ''}) {
      edges {
        node {
          id
          vendor
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }`
    }

    while (hasNextPage) {
      const query = createQuery(endCursor)
      const response = await gqlClient.query<{
        data: {
          products?: {
            edges: Array<{
              node: {
                id: string
                vendor: string
              }
            }>
            pageInfo: {
              hasNextPage: boolean
              endCursor?: string
            }
          }
        }
      }>({ data: query })

      const result = response.body

      if (!result || !result.data || !result.data.products) {
        throw new Error('Failed to fetch products')
      }

      const products = result.data.products.edges

      // Collect unique vendor names
      products.forEach((product: { node: { vendor: string } }) => {
        if (
          product.node.vendor &&
          !allVendorNames.includes(product.node.vendor)
        ) {
          allVendorNames.push(product.node.vendor)
        }
      })

      // Check if more pages exist
      hasNextPage = result.data.products.pageInfo.hasNextPage
      endCursor = result.data.products.pageInfo.endCursor
    }

    return allVendorNames
  }

  async fetchProductsNotInBrand(
    gqlClient: GraphqlClient,
    listBrand: string[],
    endCursorCondition: string | null,
    hasNextPageCondition: boolean,
    limit: number,
    combinedLists: Product[],
  ): Promise<{ endCursor: string; hasNextPage: boolean; data: Product[] }> {
    const allBrand = await this.fetchAllBrand(gqlClient)

    const listOtherBrand = allBrand.filter((item) => !listBrand.includes(item))

    return await this.fetchProductsInBrand(
      gqlClient,
      listOtherBrand,
      endCursorCondition,
      hasNextPageCondition,
      limit,
      combinedLists,
    )
  }

  refactorData(data: ProductGql[]) {
    return data.map((product) => ({
      id: extractProductId(product.id),
      url: product.onlineStorePreviewUrl,
      avatarSource: product.media.edges[0]?.node.preview.image.url,
      name: product.title,
      handle: product.handle,
      status: product.status,
      price: +product.priceRangeV2.maxVariantPrice.amount,
    }))
  }
}
