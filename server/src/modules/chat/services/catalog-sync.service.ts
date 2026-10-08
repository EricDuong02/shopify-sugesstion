import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { Session } from '@shopify/shopify-api'
import { createHash } from 'crypto'
import { Queue } from 'bullmq'
import { ShopifyService } from '@/shared/services/shopify.service'
import { LlmRegistryService } from '../llm/llm-registry.service'

export const CATALOG_SYNC_QUEUE = 'catalog-sync'

const PRODUCT_QUERY = `query GetProduct($id: ID!) {
  product(id: $id) {
    id
    title
    description
    productType
    vendor
    tags
    handle
    onlineStoreUrl
    featuredImage { url altText }
    variants(first: 10) { nodes { price } }
  }
}`

const PRODUCTS_PAGE_QUERY = `query ListProducts($cursor: String) {
  products(first: 100, after: $cursor) {
    nodes { id }
    pageInfo { hasNextPage endCursor }
  }
}`

interface ShopifyProductNode {
  id: string
  title: string
  description: string
  productType: string
  vendor: string
  tags: string[]
  handle: string
  onlineStoreUrl?: string | null
  featuredImage?: { url: string; altText?: string | null } | null
  variants: { nodes: { price: string }[] }
}

interface ProductSnapshot {
  title: string
  handle: string
  url: string
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

/**
 * Keeps the ProductEmbedding table in sync with the Shopify catalog.
 * Heavy work runs in BullMQ jobs; the GraphQL client is built from the
 * shop's offline session stored in AppSession (mirrors STSessionStorage).
 */
@Injectable()
export class CatalogSyncService {
  private readonly prisma = new PrismaClient()

  constructor(
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

  /** Enqueue a full catalog resync for a shop (used by the Config tab). */
  async enqueueShopResync(shop: string): Promise<void> {
    await this.queue.add(
      'resync-shop',
      { shop },
      { jobId: `resync-${shop}-${Date.now()}`, attempts: 2, removeOnComplete: 10 },
    )
  }

  /**
   * Sync one product: fetch from Shopify, skip re-embedding when the
   * content hash is unchanged, otherwise embed and upsert the row.
   * A missing product means it was deleted: drop its embedding row.
   */
  async syncProduct(
    shop: string,
    productId: string | number,
  ): Promise<void> {
    const numericId = toNumericId(productId)
    const gid = toGid(numericId)
    const client = await this.getGqlClient(shop)
    const product = await this.fetchProduct(client, gid)

    if (!product) {
      await this.prisma.productEmbedding.deleteMany({
        where: { shopId: shop, shopifyProductId: numericId },
      })
      return
    }

    const { text, snapshot } = this.buildDocument(shop, product)
    const contentHash = sha256(text)

    const existing = await this.prisma.productEmbedding.findUnique({
      where: {
        shopId_shopifyProductId: { shopId: shop, shopifyProductId: numericId },
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
        ("shopId", "shopifyProductId", "embedding", "contentHash",
         "productTitle", "productHandle", "productUrl", "productImageUrl", "price",
         "createdAt", "updatedAt")
      VALUES (${shop}, ${numericId}, ${literal}::vector, ${contentHash},
              ${snapshot.title}, ${snapshot.handle}, ${snapshot.url}, ${snapshot.imageUrl}, ${snapshot.price},
              NOW(), NOW())
      ON CONFLICT ("shopId", "shopifyProductId") DO UPDATE SET
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

  /** Remove one product from the embedding index. */
  async deleteProduct(shop: string, productId: string | number): Promise<void> {
    await this.prisma.productEmbedding.deleteMany({
      where: { shopId: shop, shopifyProductId: toNumericId(productId) },
    })
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

  private buildDocument(
    shop: string,
    product: ShopifyProductNode,
  ): { text: string; snapshot: ProductSnapshot } {
    const prices = product.variants.nodes.map((v) => v.price).filter(Boolean)
    const text = [
      `Title: ${product.title}`,
      `Description: ${product.description || ''}`,
      `Type: ${product.productType || ''}`,
      `Vendor: ${product.vendor || ''}`,
      `Tags: ${(product.tags || []).join(', ')}`,
      `Prices: ${prices.join(', ')}`,
      `Image: ${product.featuredImage?.altText || ''}`,
    ].join('\n')

    const firstPrice = prices.length > 0 ? parseFloat(prices[0]) : NaN

    return {
      text,
      snapshot: {
        title: product.title,
        handle: product.handle,
        url:
          product.onlineStoreUrl ||
          `https://${shop}/products/${product.handle}`,
        imageUrl: product.featuredImage?.url ?? null,
        price: Number.isNaN(firstPrice) ? null : firstPrice,
      },
    }
  }
}
