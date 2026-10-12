import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/services/prisma.service'
import { Prisma } from '@prisma/client'
import { Session } from '@shopify/shopify-api'
import { createHash } from 'crypto'
import { Queue } from 'bullmq'
import { ShopifyService } from '@/shared/services/shopify.service'
import { LlmRegistryService } from '../../chat/llm/llm-registry.service'

export const CATALOG_SYNC_QUEUE = 'catalog-sync'

const PRODUCT_QUERY = `query GetProduct($id: ID!) {
  product(id: $id) {
    id
    title
    handle
    description
    descriptionHtml
    productType
    vendor
    tags
    status
    onlineStoreUrl
    featuredImage { url altText }
    priceRangeV2 {
      minVariantPrice { amount currencyCode }
      maxVariantPrice { amount currencyCode }
    }
    options { name position values }
    createdAt
    updatedAt
    publishedAt
    variants(first: 100) {
      nodes {
        id
        title
        sku
        barcode
        price
        compareAtPrice
        availableForSale
        position
        image { url }
        selectedOptions { name value }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const VARIANTS_PAGE_QUERY = `query GetProductVariants($id: ID!, $cursor: String) {
  product(id: $id) {
    variants(first: 100, after: $cursor) {
      nodes {
        id
        title
        sku
        barcode
        price
        compareAtPrice
        availableForSale
        position
        image { url }
        selectedOptions { name value }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const PRODUCTS_PAGE_QUERY = `query ListProducts($cursor: String) {
  products(first: 100, after: $cursor) {
    nodes { id }
    pageInfo { hasNextPage endCursor }
  }
}`

interface MoneyNode {
  amount: string
  currencyCode: string
}

interface ShopifySelectedOption {
  name: string
  value: string
}

interface ShopifyVariantNode {
  id: string
  title?: string | null
  sku?: string | null
  barcode?: string | null
  price?: string | null
  compareAtPrice?: string | null
  availableForSale?: boolean | null
  inventoryQuantity?: number | null
  position?: number | null
  image?: { url?: string | null } | null
  selectedOptions?: ShopifySelectedOption[] | null
}

interface ShopifyProductNode {
  id: string
  title: string
  handle?: string | null
  description?: string | null
  descriptionHtml?: string | null
  productType?: string | null
  vendor?: string | null
  tags?: string[] | null
  status?: string | null
  onlineStoreUrl?: string | null
  featuredImage?: { url?: string | null; altText?: string | null } | null
  priceRangeV2?: {
    minVariantPrice?: MoneyNode | null
    maxVariantPrice?: MoneyNode | null
  } | null
  options?:
    { name: string; position?: number | null; values: string[] }[] | null
  createdAt?: string | null
  updatedAt?: string | null
  publishedAt?: string | null
  variants: {
    nodes: ShopifyVariantNode[]
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null
  }
}

interface ProductSnapshot {
  title: string
  handle: string | null
  url: string | null
  imageUrl: string | null
  price: number | null
}

function toGid(id: string | number): string {
  const s = String(id)
  return s.startsWith('gid://') ? s : `gid://shopify/Product/${s}`
}

function toNumericId(gid: string | number): string {
  const parts = String(gid).split('/')
  return parts[parts.length - 1]
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function parseFloatOrNull(value?: string | null): number | null {
  if (value == null || value === '') return null
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? null : parsed
}

function parseDateOrNull(value?: string | null): Date | null {
  return value ? new Date(value) : null
}

function compactLines(lines: Array<string | false | null | undefined>): string {
  return lines.filter(Boolean).join('\n')
}

/**
 * Keeps the structured catalog tables and ProductEmbedding vector index in sync
 * with Shopify. Heavy work runs in BullMQ jobs; the GraphQL client is built
 * from the shop's offline session stored in AppSession.
 */
@Injectable()
export class CatalogSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyService: ShopifyService,
    private readonly llmRegistry: LlmRegistryService,
    @InjectQueue(CATALOG_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  /** Enqueue a single product (re)sync. Deduplicated by jobId. */
  async enqueueProductSync(
    shop: string,
    productId: string | number,
  ): Promise<void> {
    const numericId = toNumericId(productId)
    const jobId = `sync-${shop}-${numericId}`

    // BullMQ silently returns an existing job when the jobId matches, so a
    // job left in a terminal state (failed or completed) would block every
    // future sync of this product. Remove it first; jobs that are still
    // queued are kept so webhook bursts stay deduplicated.
    const existing = await this.queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'failed' || state === 'completed') {
        await existing.remove()
      } else {
        return
      }
    }

    await this.queue.add(
      'sync-product',
      { shop, productId: numericId },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    )
  }

  /** Enqueue a full catalog resync for a shop (used by first sync and Config). */
  async enqueueShopResync(shop: string): Promise<void> {
    await this.queue.add(
      'resync-shop',
      { shop },
      {
        jobId: `resync-${shop}-${Date.now()}`,
        attempts: 2,
        removeOnComplete: 10,
      },
    )
  }

  /** Enqueue the first install catalog sync once; later manual resyncs remain separate. */
  async enqueueInitialCatalogResync(shop: string): Promise<void> {
    const jobId = `initial-resync-${shop}`
    const existing = await this.queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state !== 'failed') return
      await existing.remove()
    }

    await this.queue.add(
      'resync-shop',
      { shop },
      {
        jobId,
        attempts: 2,
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    )
  }

  /**
   * Sync one product: fetch from Shopify, upsert structured catalog rows, then
   * refresh the semantic embedding when the embedding document changes.
   */
  async syncProduct(shop: string, productId: string | number): Promise<void> {
    const numericId = toNumericId(productId)
    const gid = toGid(numericId)
    const client = await this.getGqlClient(shop)
    const product = await this.fetchProduct(client, gid)

    if (product) {
      await this.fetchRemainingVariants(client, gid, product)
    }

    if (!product) {
      await this.deleteProduct(shop, numericId)
      return
    }

    const { text, snapshot } = this.buildDocument(shop, product)
    const contentHash = sha256(text)

    await this.upsertStructuredCatalog(shop, numericId, product)

    const existing = await this.prisma.productEmbedding.findUnique({
      where: {
        shopId_shopifyProductId_chunkType: {
          shopId: shop,
          shopifyProductId: numericId,
          chunkType: 'product',
        },
      },
      select: { contentHash: true },
    })
    if (existing && existing.contentHash === contentHash) return

    const provider = this.llmRegistry.createEmbeddingProvider()
    if (!provider) {
      console.warn(
        `[catalog-sync] no embedding provider configured, skipping product ${numericId}`,
      )
      return
    }

    const vectors = await provider.embed(
      [text],
      this.llmRegistry.getEmbeddingModel(),
    )
    const vector = vectors[0]
    if (!vector || vector.length === 0) {
      throw new Error('Embedding provider returned no vector')
    }
    const literal = `[${vector.join(',')}]`

    // Prisma Client cannot write Unsupported("vector") columns, so use raw SQL.
    await this.prisma.$executeRaw`
      INSERT INTO "ProductEmbedding"
        ("shopId", "shopifyProductId", "chunkType", "text", "embedding", "contentHash",
         "productTitle", "productHandle", "productUrl", "productImageUrl", "price",
         "createdAt", "updatedAt")
      VALUES (${shop}, ${numericId}, ${'product'}, ${text}, ${literal}::vector, ${contentHash},
              ${snapshot.title}, ${snapshot.handle}, ${snapshot.url}, ${snapshot.imageUrl}, ${snapshot.price},
              NOW(), NOW())
      ON CONFLICT ("shopId", "shopifyProductId", "chunkType") DO UPDATE SET
        "text" = EXCLUDED."text",
        "embedding" = EXCLUDED."embedding",
        "contentHash" = EXCLUDED."contentHash",
        "productTitle" = EXCLUDED."productTitle",
        "productHandle" = EXCLUDED."productHandle",
        "productUrl" = EXCLUDED."productUrl",
        "productImageUrl" = EXCLUDED."productImageUrl",
        "price" = EXCLUDED."price",
        "updatedAt" = NOW()
    `
  }

  /** Remove one product from the structured catalog and embedding index. */
  async deleteProduct(shop: string, productId: string | number): Promise<void> {
    const numericId = toNumericId(productId)
    await this.prisma.$transaction([
      this.prisma.productEmbedding.deleteMany({
        where: { shopId: shop, shopifyProductId: numericId },
      }),
      this.prisma.catalogVariant.deleteMany({
        where: { shopId: shop, shopifyProductId: numericId },
      }),
      this.prisma.catalogOption.deleteMany({
        where: { shopId: shop, shopifyProductId: numericId },
      }),
      this.prisma.catalogProduct.deleteMany({
        where: { shopId: shop, shopifyProductId: numericId },
      }),
    ])
  }

  /** Page through the whole catalog and enqueue one sync job per product. */
  async resyncShop(shop: string): Promise<void> {
    const client = await this.getGqlClient(shop)
    let cursor: string | null = null

    for (;;) {
      const response: any = await client.query({
        data: { query: PRODUCTS_PAGE_QUERY, variables: { cursor } },
      })
      const connection = response?.body?.data?.products
      if (!connection) {
        throw new Error('Unexpected products response from Shopify')
      }

      for (const node of connection.nodes as { id: string }[]) {
        await this.enqueueProductSync(shop, toNumericId(node.id))
      }

      if (!connection.pageInfo?.hasNextPage) break
      cursor = connection.pageInfo.endCursor
    }
  }

  private async getGqlClient(shop: string): Promise<any> {
    const session = await this.getOfflineSession(shop)
    if (!session) throw new Error(`No offline session found for shop ${shop}`)
    return this.shopifyService.getGQLClient(session)
  }

  /**
   * Rebuilds an offline Session from the AppSession row, mirroring what
   * STSessionStorage.findSessionsByShop does.
   */
  private async getOfflineSession(shop: string): Promise<Session | null> {
    const records = await this.prisma.appSession.findMany({ where: { shop } })
    const offline = records.find((r) => {
      const payload = r.payload as any
      return payload && payload.isOnline === false && payload.accessToken
    })
    if (!offline) return null

    const payload = offline.payload as any
    return new Session({
      id: offline.id,
      shop,
      state: payload.state ?? 'background-sync',
      isOnline: false,
      accessToken: payload.accessToken,
      scope: payload.scope,
      expires: payload.expires ? new Date(payload.expires) : undefined,
    })
  }

  private async fetchProduct(
    client: any,
    gid: string,
  ): Promise<ShopifyProductNode | null> {
    const response: any = await client.query({
      data: { query: PRODUCT_QUERY, variables: { id: gid } },
    })
    return response?.body?.data?.product ?? null
  }

  private async fetchRemainingVariants(
    client: any,
    gid: string,
    product: ShopifyProductNode,
  ): Promise<void> {
    let cursor = product.variants?.pageInfo?.endCursor ?? null
    let hasNextPage = Boolean(product.variants?.pageInfo?.hasNextPage)

    while (hasNextPage) {
      const response: any = await client.query({
        data: { query: VARIANTS_PAGE_QUERY, variables: { id: gid, cursor } },
      })
      const connection = response?.body?.data?.product?.variants
      if (!connection) break

      product.variants.nodes.push(...(connection.nodes ?? []))
      cursor = connection.pageInfo?.endCursor ?? null
      hasNextPage = Boolean(connection.pageInfo?.hasNextPage)
    }
  }

  private async upsertStructuredCatalog(
    shop: string,
    numericId: string,
    product: ShopifyProductNode,
  ): Promise<void> {
    const minPrice = parseFloatOrNull(
      product.priceRangeV2?.minVariantPrice?.amount,
    )
    const maxPrice = parseFloatOrNull(
      product.priceRangeV2?.maxVariantPrice?.amount,
    )
    const currencyCode =
      product.priceRangeV2?.minVariantPrice?.currencyCode ||
      product.priceRangeV2?.maxVariantPrice?.currencyCode ||
      null

    await this.prisma.$transaction(async (tx) => {
      await tx.catalogProduct.upsert({
        where: {
          shopId_shopifyProductId: {
            shopId: shop,
            shopifyProductId: numericId,
          },
        },
        create: {
          shopId: shop,
          shopifyProductId: numericId,
          title: product.title,
          handle: product.handle ?? null,
          description: product.description ?? null,
          descriptionHtml: product.descriptionHtml ?? null,
          productType: product.productType ?? null,
          vendor: product.vendor ?? null,
          tags: product.tags ?? [],
          status: product.status ?? null,
          onlineStoreUrl: product.onlineStoreUrl ?? null,
          featuredImageUrl: product.featuredImage?.url ?? null,
          featuredImageAltText: product.featuredImage?.altText ?? null,
          minPrice,
          maxPrice,
          currencyCode,
          publishedAt: parseDateOrNull(product.publishedAt),
          createdAtShopify: parseDateOrNull(product.createdAt),
          updatedAtShopify: parseDateOrNull(product.updatedAt),
        },
        update: {
          title: product.title,
          handle: product.handle ?? null,
          description: product.description ?? null,
          descriptionHtml: product.descriptionHtml ?? null,
          productType: product.productType ?? null,
          vendor: product.vendor ?? null,
          tags: product.tags ?? [],
          status: product.status ?? null,
          onlineStoreUrl: product.onlineStoreUrl ?? null,
          featuredImageUrl: product.featuredImage?.url ?? null,
          featuredImageAltText: product.featuredImage?.altText ?? null,
          minPrice,
          maxPrice,
          currencyCode,
          publishedAt: parseDateOrNull(product.publishedAt),
          createdAtShopify: parseDateOrNull(product.createdAt),
          updatedAtShopify: parseDateOrNull(product.updatedAt),
        },
      })

      await tx.catalogVariant.deleteMany({
        where: { shopId: shop, shopifyProductId: numericId },
      })
      await tx.catalogOption.deleteMany({
        where: { shopId: shop, shopifyProductId: numericId },
      })

      if (product.options?.length) {
        await tx.catalogOption.createMany({
          data: product.options.map((option) => ({
            shopId: shop,
            shopifyProductId: numericId,
            name: option.name,
            values: option.values ?? [],
            position: option.position ?? null,
          })),
        })
      }

      const variants = product.variants?.nodes ?? []
      if (variants.length) {
        await tx.catalogVariant.createMany({
          data: variants.map((variant) => ({
            shopId: shop,
            shopifyProductId: numericId,
            shopifyVariantId: toNumericId(variant.id),
            title: variant.title ?? null,
            sku: variant.sku ?? null,
            barcode: variant.barcode ?? null,
            price: parseFloatOrNull(variant.price),
            compareAtPrice: parseFloatOrNull(variant.compareAtPrice),
            currencyCode,
            availableForSale: variant.availableForSale ?? null,
            inventoryQuantity: variant.inventoryQuantity ?? null,
            selectedOptions: this.selectedOptionsToJson(
              variant.selectedOptions,
            ),
            imageUrl: variant.image?.url ?? null,
            position: variant.position ?? null,
          })),
        })
      }
    })
  }

  private selectedOptionsToJson(
    selectedOptions?: ShopifySelectedOption[] | null,
  ): Prisma.InputJsonValue {
    return (selectedOptions ?? []).reduce<Record<string, string>>(
      (acc, option) => {
        if (option.name) acc[option.name] = option.value
        return acc
      },
      {},
    )
  }

  private buildDocument(
    shop: string,
    product: ShopifyProductNode,
  ): { text: string; snapshot: ProductSnapshot } {
    const variants = product.variants?.nodes ?? []
    const options = product.options ?? []
    const minPrice = parseFloatOrNull(
      product.priceRangeV2?.minVariantPrice?.amount,
    )
    const maxPrice = parseFloatOrNull(
      product.priceRangeV2?.maxVariantPrice?.amount,
    )

    const optionText = options
      .map((option) => `${option.name}: ${(option.values ?? []).join(', ')}`)
      .join('\n')
    const variantText = variants
      .map((variant) => {
        const selected = (variant.selectedOptions ?? [])
          .map((option) => `${option.name}: ${option.value}`)
          .join(', ')
        return compactLines([
          `Variant: ${variant.title || 'Default'}`,
          selected && `Options: ${selected}`,
          variant.sku && `SKU: ${variant.sku}`,
          variant.price && `Price: ${variant.price}`,
          variant.availableForSale != null &&
            `Available: ${variant.availableForSale ? 'yes' : 'no'}`,
        ])
      })
      .join('\n---\n')

    const text = compactLines([
      `Title: ${product.title}`,
      `Description: ${product.description || ''}`,
      `Type: ${product.productType || ''}`,
      `Vendor: ${product.vendor || ''}`,
      `Tags: ${(product.tags || []).join(', ')}`,
      minPrice != null || maxPrice != null
        ? `Price range: ${minPrice ?? ''} - ${maxPrice ?? ''}`
        : null,
      optionText && `Options:\n${optionText}`,
      variantText && `Variants:\n${variantText}`,
      `Image: ${product.featuredImage?.altText || ''}`,
    ])

    return {
      text,
      snapshot: {
        title: product.title,
        handle: product.handle ?? null,
        url:
          product.onlineStoreUrl ||
          (product.handle
            ? `https://${shop}/products/${product.handle}`
            : null),
        imageUrl: product.featuredImage?.url ?? null,
        price: minPrice,
      },
    }
  }
}
