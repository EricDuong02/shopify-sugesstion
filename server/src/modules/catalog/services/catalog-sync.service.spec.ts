import { PrismaService } from '@/shared/services/prisma.service'
import { ShopifyService } from '@/shared/services/shopify.service'
import { LlmRegistryService } from '../../chat/llm/llm-registry.service'
import {
  RecommendationCacheService,
  RecommendationRedisClient,
} from '../../recommendation-cache/services/recommendation-cache.service'
import { CatalogSyncService } from './catalog-sync.service'

const createRedis = (): RecommendationRedisClient => ({
  get: jest.fn().mockResolvedValue(null),
  increment: jest.fn().mockResolvedValue(1),
  setEx: jest.fn().mockResolvedValue('OK'),
  setLock: jest.fn().mockResolvedValue('OK'),
  releaseLock: jest.fn().mockResolvedValue(undefined),
})

const createCache = (
  invalidateCampaign = jest.fn().mockResolvedValue(undefined),
  invalidateCampaigns = jest.fn().mockResolvedValue(undefined),
) =>
  Object.assign(new RecommendationCacheService(createRedis()), {
    invalidateCampaign,
    invalidateCampaigns,
  })

const createService = (
  prisma: PrismaService = new PrismaService(),
  cache: RecommendationCacheService = createCache(),
) =>
  new CatalogSyncService(
    prisma,
    new ShopifyService(null),
    new LlmRegistryService(),
    null,
    cache,
  )

describe('CatalogSyncService selected product hydration', () => {
  it('deduplicates IDs and disables embeddings during hydration', async () => {
    const service = createService()
    const syncProduct = jest
      .spyOn(service, 'syncProduct')
      .mockResolvedValue(undefined)

    await service.ensureProductsSynced('shop.example.com', [
      'gid://shopify/Product/101',
      '101',
      102,
    ])

    expect(syncProduct).toHaveBeenCalledTimes(2)
    expect(syncProduct).toHaveBeenNthCalledWith(1, 'shop.example.com', '101', {
      refreshEmbedding: false,
    })
    expect(syncProduct).toHaveBeenNthCalledWith(2, 'shop.example.com', '102', {
      refreshEmbedding: false,
    })
  })

  it('rejects malformed product IDs before making Shopify calls', async () => {
    const service = createService()
    const syncProduct = jest.spyOn(service, 'syncProduct')

    await expect(
      service.ensureProductsSynced('shop.example.com', ['not-a-product-id']),
    ).rejects.toThrow('Invalid Shopify product ID')
    expect(syncProduct).not.toHaveBeenCalled()
  })

  it('limits one hydration request to 50 products', async () => {
    const service = createService()
    const syncProduct = jest
      .spyOn(service, 'syncProduct')
      .mockResolvedValue(undefined)
    const ids = Array.from({ length: 51 }, (_, index) => String(index + 1))

    await expect(
      service.ensureProductsSynced('shop.example.com', ids),
    ).rejects.toThrow('Too many products')
    expect(syncProduct).not.toHaveBeenCalled()
  })

  it('runs no more than four product syncs concurrently', async () => {
    const service = createService()
    let active = 0
    let maximumActive = 0
    jest.spyOn(service, 'syncProduct').mockImplementation(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setImmediate(resolve))
      active -= 1
    })

    await service.ensureProductsSynced(
      'shop.example.com',
      Array.from({ length: 9 }, (_, index) => String(index + 1)),
    )

    expect(maximumActive).toBeLessThanOrEqual(4)
  })
})

describe('CatalogSyncService cache invalidation', () => {
  it('invalidates affected campaigns after deleting a tenant-scoped product', async () => {
    const offerProductItem = {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { offerProductId: 7 },
          { offerProductId: 7 },
          { offerProductId: 8 },
        ]),
    }
    const transactionClient = {
      offerProductItem,
      productEmbedding: { deleteMany: jest.fn().mockResolvedValue(undefined) },
      catalogVariant: { deleteMany: jest.fn().mockResolvedValue(undefined) },
      catalogOption: { deleteMany: jest.fn().mockResolvedValue(undefined) },
      catalogProduct: { deleteMany: jest.fn().mockResolvedValue(undefined) },
    }
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          callback: (client: typeof transactionClient) => Promise<number[]>,
        ) => callback(transactionClient),
      )
    const prisma = Object.assign(new PrismaService(), {
      $transaction: transaction,
    })
    const invalidateCampaigns = jest.fn().mockResolvedValue(undefined)
    const cache = createCache(jest.fn(), invalidateCampaigns)
    const service = createService(prisma, cache)

    await service.deleteProduct('shop-a.myshopify.com', '101')

    expect(offerProductItem.findMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-a.myshopify.com', shopifyProductId: '101' },
      select: { offerProductId: true },
    })
    expect(invalidateCampaigns).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      [7, 8],
    )
    expect(transaction).toHaveBeenCalledTimes(1)
  })

  it('does not invalidate campaigns when catalog deletion fails', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValue(new Error('database unavailable'))
    const prisma = Object.assign(new PrismaService(), {
      $transaction: transaction,
    })
    const invalidateCampaigns = jest.fn().mockResolvedValue(undefined)
    const service = createService(
      prisma,
      createCache(jest.fn(), invalidateCampaigns),
    )

    await expect(
      service.deleteProduct('shop-a.myshopify.com', '101'),
    ).rejects.toThrow('database unavailable')
    expect(invalidateCampaigns).not.toHaveBeenCalled()
  })

  it('does not invalidate campaigns when structured catalog upsert fails', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValue(new Error('database unavailable'))
    const prisma = Object.assign(new PrismaService(), {
      $transaction: transaction,
    })
    const invalidateCampaigns = jest.fn().mockResolvedValue(undefined)
    const service = createService(
      prisma,
      createCache(jest.fn(), invalidateCampaigns),
    )
    Object.assign(service, {
      getGqlClient: jest.fn().mockResolvedValue({}),
      fetchProduct: jest.fn().mockResolvedValue({
        id: 'gid://shopify/Product/101',
        title: 'Product A',
        handle: 'product-a',
        description: null,
        descriptionHtml: null,
        productType: null,
        vendor: null,
        tags: [],
        status: 'ACTIVE',
        onlineStoreUrl: 'https://shop-a.myshopify.com/products/product-a',
        featuredImage: null,
        priceRangeV2: null,
        options: [],
        createdAt: null,
        updatedAt: null,
        publishedAt: null,
        variants: { nodes: [], pageInfo: null },
      }),
      fetchRemainingVariants: jest.fn().mockResolvedValue(undefined),
    })

    await expect(
      service.syncProduct('shop-a.myshopify.com', '101', {
        refreshEmbedding: false,
      }),
    ).rejects.toThrow('database unavailable')
    expect(invalidateCampaigns).not.toHaveBeenCalled()
  })

  it('does not increment a generation when a catalog product has no campaign references', async () => {
    const offerProductItem = {
      findMany: jest.fn().mockResolvedValue([]),
    }
    const transactionClient = {
      offerProductItem,
      catalogProduct: { upsert: jest.fn().mockResolvedValue(undefined) },
      catalogVariant: { deleteMany: jest.fn().mockResolvedValue(undefined) },
      catalogOption: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    }
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          callback: (client: typeof transactionClient) => Promise<number[]>,
        ) => callback(transactionClient),
      )
    const increment = jest.fn().mockResolvedValue(1)
    const cache = new RecommendationCacheService({
      get: jest.fn().mockResolvedValue(null),
      increment,
      setEx: jest.fn().mockResolvedValue('OK'),
      setLock: jest.fn().mockResolvedValue('OK'),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    })
    const service = createService(
      Object.assign(new PrismaService(), { $transaction: transaction }),
      cache,
    )
    Object.assign(service, {
      getGqlClient: jest.fn().mockResolvedValue({}),
      fetchProduct: jest.fn().mockResolvedValue({
        id: 'gid://shopify/Product/101',
        title: 'Product A',
        handle: 'product-a',
        description: null,
        descriptionHtml: null,
        productType: null,
        vendor: null,
        tags: [],
        status: 'ACTIVE',
        onlineStoreUrl: 'https://shop-a.myshopify.com/products/product-a',
        featuredImage: null,
        priceRangeV2: null,
        options: [],
        createdAt: null,
        updatedAt: null,
        publishedAt: null,
        variants: { nodes: [], pageInfo: null },
      }),
      fetchRemainingVariants: jest.fn().mockResolvedValue(undefined),
    })

    await service.syncProduct('shop-a.myshopify.com', '101', {
      refreshEmbedding: false,
    })

    expect(increment).not.toHaveBeenCalled()
  })

  it('invalidates campaigns only after the catalog transaction resolves', async () => {
    const events: string[] = []
    const transactionClient = {
      offerProductItem: {
        findMany: jest.fn().mockResolvedValue([{ offerProductId: 7 }]),
      },
      catalogProduct: { upsert: jest.fn().mockResolvedValue(undefined) },
      catalogVariant: { deleteMany: jest.fn().mockResolvedValue(undefined) },
      catalogOption: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    }
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          callback: (client: typeof transactionClient) => Promise<number[]>,
        ) => {
          await callback(transactionClient)
          events.push('committed')
          return [7]
        },
      )
    const invalidateCampaigns = jest.fn().mockImplementation(async () => {
      events.push('invalidated')
    })
    const service = createService(
      Object.assign(new PrismaService(), { $transaction: transaction }),
      createCache(jest.fn(), invalidateCampaigns),
    )
    Object.assign(service, {
      getGqlClient: jest.fn().mockResolvedValue({}),
      fetchProduct: jest.fn().mockResolvedValue({
        id: 'gid://shopify/Product/101',
        title: 'Product A',
        handle: 'product-a',
        description: null,
        descriptionHtml: null,
        productType: null,
        vendor: null,
        tags: [],
        status: 'ACTIVE',
        onlineStoreUrl: 'https://shop-a.myshopify.com/products/product-a',
        featuredImage: null,
        priceRangeV2: null,
        options: [],
        createdAt: null,
        updatedAt: null,
        publishedAt: null,
        variants: { nodes: [], pageInfo: null },
      }),
      fetchRemainingVariants: jest.fn().mockResolvedValue(undefined),
    })

    await service.syncProduct('shop-a.myshopify.com', '101', {
      refreshEmbedding: false,
    })

    expect(events).toEqual(['committed', 'invalidated'])
  })

  it('does not invalidate a different tenant product reference', async () => {
    const offerProductItem = {
      findMany: jest.fn().mockResolvedValue([{ offerProductId: 7 }]),
    }
    const transactionClient = {
      offerProductItem,
      catalogProduct: { upsert: jest.fn().mockResolvedValue(undefined) },
      catalogVariant: { deleteMany: jest.fn().mockResolvedValue(undefined) },
      catalogOption: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    }
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          callback: (client: typeof transactionClient) => Promise<number[]>,
        ) => callback(transactionClient),
      )
    const invalidateCampaigns = jest.fn().mockResolvedValue(undefined)
    const service = createService(
      Object.assign(new PrismaService(), { $transaction: transaction }),
      createCache(jest.fn(), invalidateCampaigns),
    )
    Object.assign(service, {
      getGqlClient: jest.fn().mockResolvedValue({}),
      fetchProduct: jest.fn().mockResolvedValue({
        id: 'gid://shopify/Product/101',
        title: 'Product A',
        handle: 'product-a',
        description: null,
        descriptionHtml: null,
        productType: null,
        vendor: null,
        tags: [],
        status: 'ACTIVE',
        onlineStoreUrl: 'https://shop-b.myshopify.com/products/product-a',
        featuredImage: null,
        priceRangeV2: null,
        options: [],
        createdAt: null,
        updatedAt: null,
        publishedAt: null,
        variants: { nodes: [], pageInfo: null },
      }),
      fetchRemainingVariants: jest.fn().mockResolvedValue(undefined),
    })

    await service.syncProduct('shop-b.myshopify.com', '101', {
      refreshEmbedding: false,
    })

    expect(offerProductItem.findMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-b.myshopify.com', shopifyProductId: '101' },
      select: { offerProductId: true },
    })
    expect(invalidateCampaigns).toHaveBeenCalledWith(
      'shop-b.myshopify.com',
      [7],
    )
  })

  it('invalidates affected campaigns after structured catalog upsert without embedding refresh', async () => {
    const offerProductItem = {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { offerProductId: 7 },
          { offerProductId: 7 },
          { offerProductId: 8 },
        ]),
    }
    const transactionClient = {
      offerProductItem,
      catalogProduct: { upsert: jest.fn().mockResolvedValue(undefined) },
      catalogVariant: { deleteMany: jest.fn().mockResolvedValue(undefined) },
      catalogOption: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
      catalogProductEmbedding: undefined,
    }
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          callback: (client: typeof transactionClient) => Promise<number[]>,
        ) => callback(transactionClient),
      )
    const prisma = Object.assign(new PrismaService(), {
      $transaction: transaction,
    })
    const invalidateCampaigns = jest.fn().mockResolvedValue(undefined)
    const service = createService(
      prisma,
      createCache(jest.fn(), invalidateCampaigns),
    )
    Object.assign(service, {
      getGqlClient: jest.fn().mockResolvedValue({}),
      fetchProduct: jest.fn().mockResolvedValue({
        id: 'gid://shopify/Product/101',
        title: 'Product A',
        handle: 'product-a',
        description: null,
        descriptionHtml: null,
        productType: null,
        vendor: null,
        tags: [],
        status: 'ACTIVE',
        onlineStoreUrl: 'https://shop-a.myshopify.com/products/product-a',
        featuredImage: null,
        priceRangeV2: null,
        options: [],
        createdAt: null,
        updatedAt: null,
        publishedAt: null,
        variants: { nodes: [], pageInfo: null },
      }),
      fetchRemainingVariants: jest.fn().mockResolvedValue(undefined),
    })

    await service.syncProduct('shop-a.myshopify.com', '101', {
      refreshEmbedding: false,
    })

    expect(offerProductItem.findMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-a.myshopify.com', shopifyProductId: '101' },
      select: { offerProductId: true },
    })
    expect(invalidateCampaigns).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      [7, 8],
    )
  })
})
