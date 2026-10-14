import { PrismaService } from '@/shared/services/prisma.service'
import { CatalogSyncService } from '@/modules/catalog/services/catalog-sync.service'
import { ListProductService } from '@/modules/recommender-api/services/list-product.service'
import { CreateProductRecommenderDto } from '../dtos/create-product-recommender.dto'
import { GetDetail } from '../dtos/get-detail.dto'
import { UpdateProductRecommenderDto } from '../dtos/update-product-recommender.dto'
import { RecommenderService } from './recommender.service'
import {
  RecommendationCacheService,
  RecommendationRedisClient,
} from '@/modules/recommendation-cache/services/recommendation-cache.service'

const createRedis = (): RecommendationRedisClient => ({
  get: jest.fn().mockResolvedValue(null),
  increment: jest.fn().mockResolvedValue(1),
  setEx: jest.fn().mockResolvedValue('OK'),
  setLock: jest.fn().mockResolvedValue('OK'),
  releaseLock: jest.fn().mockResolvedValue(undefined),
})

const createPrisma = (overrides: Record<string, unknown> = {}) =>
  Object.assign(new PrismaService(), overrides)

const createListProductService = (overrides: Record<string, unknown> = {}) =>
  Object.assign(new ListProductService(null, null), overrides)

const createCatalogSyncService = (overrides: Record<string, unknown> = {}) =>
  Object.assign(
    new CatalogSyncService(null, null, null, null, null),
    { ensureProductsSynced: jest.fn().mockResolvedValue(undefined) },
    overrides,
  )

const createRecommendationCache = (
  invalidateCampaign = jest.fn().mockResolvedValue(undefined),
) =>
  Object.assign(new RecommendationCacheService(createRedis()), {
    invalidateCampaign,
  })

const triggerGroup = {
  typeId: [],
  ids: ['gid://shopify/Product/101'],
  rules: [],
}

const fallbackGroup = {
  typeId: [],
  ids: ['103', '104'],
  rules: [],
}

describe('RecommenderService canonical offer items', () => {
  it('normalizes GID and numeric IDs and keeps fallback order', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { shopifyProductId: '101' },
        { shopifyProductId: '102' },
        { shopifyProductId: '103' },
        { shopifyProductId: '104' },
      ])
    const getDataByCondition = jest
      .fn()
      .mockResolvedValue([{ id: 'gid://shopify/Product/102' }])
    const service = new RecommenderService(
      createPrisma({ catalogProduct: { findMany } }),
      createListProductService({ getDataByCondition }),
      createCatalogSyncService(),
      createRecommendationCache(),
    )

    const result = await service.resolveOfferItems(
      null,
      'shop.example.com',
      {
        ...triggerGroup,
        typeId: ['3'],
        rules: [{ column: '0', relation: '3', value: ['SKU-1'] }],
      },
      fallbackGroup,
    )

    expect(findMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop.example.com',
        shopifyProductId: { in: ['101', '102', '103', '104'] },
      },
      select: { shopifyProductId: true },
    })
    expect(result).toEqual([
      {
        shopId: 'shop.example.com',
        shopifyProductId: '101',
        position: 0,
        source: 'trigger',
      },
      {
        shopId: 'shop.example.com',
        shopifyProductId: '102',
        position: 1,
        source: 'trigger',
      },
      {
        shopId: 'shop.example.com',
        shopifyProductId: '103',
        position: 2,
        source: 'fallback',
      },
      {
        shopId: 'shop.example.com',
        shopifyProductId: '104',
        position: 3,
        source: 'fallback',
      },
    ])
  })

  it('hydrates missing catalog products before resolving canonical items', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ shopifyProductId: '101' }])
    const ensureProductsSynced = jest.fn().mockResolvedValue(undefined)
    const service = new RecommenderService(
      createPrisma({ catalogProduct: { findMany } }),
      createListProductService(),
      createCatalogSyncService({ ensureProductsSynced }),
      createRecommendationCache(),
    )

    await expect(
      service.resolveOfferItems(null, 'shop.example.com', triggerGroup),
    ).resolves.toEqual([
      {
        shopId: 'shop.example.com',
        shopifyProductId: '101',
        position: 0,
        source: 'trigger',
      },
    ])

    expect(ensureProductsSynced).toHaveBeenCalledWith('shop.example.com', [
      '101',
    ])
    expect(findMany).toHaveBeenCalledTimes(2)
  })

  it('returns conflict when synced products are absent from Shopify', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const service = new RecommenderService(
      createPrisma({ catalogProduct: { findMany } }),
      createListProductService(),
      createCatalogSyncService({
        ensureProductsSynced: jest.fn().mockResolvedValue(undefined),
      }),
      createRecommendationCache(),
    )

    await expect(
      service.resolveOfferItems(null, 'shop.example.com', triggerGroup),
    ).rejects.toThrow('Catalog sync is incomplete for products: 101')
  })

  it('returns service unavailable when catalog hydration fails', async () => {
    const ensureProductsSynced = jest
      .fn()
      .mockRejectedValue(new Error('Shopify unavailable'))
    const service = new RecommenderService(
      createPrisma({
        catalogProduct: { findMany: jest.fn().mockResolvedValue([]) },
      }),
      createListProductService(),
      createCatalogSyncService({ ensureProductsSynced }),
      createRecommendationCache(),
    )

    await expect(
      service.resolveOfferItems(null, 'shop.example.com', triggerGroup),
    ).rejects.toThrow('Catalog sync is unavailable for products: 101')
  })

  it('rejects invalid trigger page IDs before creating an offer', async () => {
    const transaction = jest.fn()
    const service = new RecommenderService(
      createPrisma({ $transaction: transaction }),
      createListProductService(),
      createCatalogSyncService(),
      createRecommendationCache(),
    )
    const data: CreateProductRecommenderDto = {
      name: 'Related products',
      placeId: 0,
      productGroups: { typeId: [], ids: [], rules: [] },
      trigger: {
        pageIds: ['9'],
        productGroups: { typeId: [], ids: [], rules: [] },
      },
      fallback: { productGroups: { typeId: [], ids: [], rules: [] } },
      scheduleOn: true,
    }

    await expect(
      service.createData(null, 'shop.example.com', data),
    ).rejects.toThrow('Unsupported trigger page ID: 9')
    expect(transaction).not.toHaveBeenCalled()
  })

  it('writes canonical items during create', async () => {
    const tx = {
      offerProduct: {
        create: jest.fn().mockResolvedValue({ id: 7 }),
      },
      offerProductItem: {
        createMany: jest.fn(),
      },
    }
    const transaction = jest.fn(async (callback) => callback(tx))
    const prisma = createPrisma({
      catalogProduct: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { shopifyProductId: '101' },
            { shopifyProductId: '999' },
          ]),
      },
      $transaction: transaction,
    })
    const invalidateCampaign = jest.fn().mockResolvedValue(undefined)
    const service = new RecommenderService(
      prisma,
      createListProductService(),
      createCatalogSyncService(),
      createRecommendationCache(invalidateCampaign),
    )
    const data: CreateProductRecommenderDto = {
      name: 'Related products',
      placeId: 0,
      productGroups: {
        typeId: [],
        ids: ['gid://shopify/Product/999'],
        rules: [],
      },
      trigger: {
        productGroups: triggerGroup,
      },
      fallback: { productGroups: { typeId: [], ids: [], rules: [] } },
      scheduleOn: true,
    }

    await service.createData(null, 'shop.example.com', data)

    expect(tx.offerProduct.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triggerProduct: expect.objectContaining({
            create: expect.objectContaining({
              pageIds: [],
              productGroups: expect.objectContaining({
                create: expect.objectContaining({ ids: triggerGroup.ids }),
              }),
            }),
          }),
          productGroups: expect.objectContaining({
            create: expect.objectContaining({
              ids: ['gid://shopify/Product/999'],
            }),
          }),
        }),
      }),
    )
    expect(tx.offerProductItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          shopId: 'shop.example.com',
          shopifyProductId: '101',
          position: 0,
          source: 'trigger',
          offerProductId: 7,
        },
      ],
    })
    expect(invalidateCampaign).toHaveBeenCalledWith('shop.example.com', 7)
  })

  it('filters admin items by the requested shop', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const service = new RecommenderService(
      createPrisma({ offerProduct: { findMany } }),
      createListProductService(),
      createCatalogSyncService(),
      createRecommendationCache(),
    )

    await service.getData('shop-a.myshopify.com', {
      id: '7',
    } satisfies GetDetail)

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop-a.myshopify.com', id: 7 },
        include: expect.objectContaining({
          items: expect.objectContaining({
            where: { shopId: 'shop-a.myshopify.com' },
          }),
        }),
      }),
    )
  })

  it('clears canonical items when update resolves no catalog products', async () => {
    const tx = {
      offerProduct: {
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
      offerProductItem: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    }
    const transaction = jest.fn(async (callback) => callback(tx))
    const prisma = createPrisma({
      offerProduct: {
        findFirst: jest.fn().mockResolvedValue({
          id: 7,
          fallBackProduct: null,
          triggerProduct: { pageIds: [1, 4] },
        }),
      },
      rules: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      catalogProduct: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: transaction,
    })
    const invalidateCampaign = jest.fn().mockResolvedValue(undefined)
    const service = new RecommenderService(
      prisma,
      createListProductService(),
      createCatalogSyncService(),
      createRecommendationCache(invalidateCampaign),
    )
    const data: UpdateProductRecommenderDto = {
      id: '7',
      name: 'Related products',
      placeId: 0,
      productGroups: { id: '10', typeId: [], ids: [], rules: [] },
      trigger: {
        id: '8',
        productGroups: { id: '9', typeId: [], ids: [], rules: [] },
      },
      fallback: {
        id: '',
        productGroups: { id: '', typeId: [], ids: [], rules: [] },
      },
      scheduleOn: true,
    }

    await service.updateData(null, 'shop.example.com', data)

    expect(tx.offerProduct.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triggerProduct: expect.objectContaining({
            update: expect.objectContaining({
              data: expect.objectContaining({ pageIds: [1, 4] }),
            }),
          }),
        }),
      }),
    )
    expect(tx.offerProduct.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          fallBackProduct: expect.anything(),
        }),
      }),
    )
    expect(tx.offerProductItem.deleteMany).toHaveBeenCalledWith({
      where: { offerProductId: 7, shopId: 'shop.example.com' },
    })
    expect(tx.offerProductItem.createMany).not.toHaveBeenCalled()
    expect(invalidateCampaign).toHaveBeenCalledWith('shop.example.com', 7)
  })

  it('clears legacy page IDs when an update explicitly sends an empty array', async () => {
    const tx = {
      offerProduct: {
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
      offerProductItem: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    }
    const transaction = jest.fn(async (callback) => callback(tx))
    const prisma = createPrisma({
      offerProduct: {
        findFirst: jest.fn().mockResolvedValue({
          id: 7,
          fallBackProduct: null,
          triggerProduct: { pageIds: [1, 4] },
        }),
      },
      rules: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      catalogProduct: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: transaction,
    })
    const service = new RecommenderService(
      prisma,
      createListProductService(),
      createCatalogSyncService(),
      createRecommendationCache(),
    )
    const data: UpdateProductRecommenderDto = {
      id: '7',
      name: 'Related products',
      placeId: 0,
      productGroups: { id: '10', typeId: [], ids: [], rules: [] },
      trigger: {
        id: '8',
        pageIds: [],
        productGroups: { id: '9', typeId: [], ids: [], rules: [] },
      },
      fallback: {
        id: '',
        productGroups: { id: '', typeId: [], ids: [], rules: [] },
      },
      scheduleOn: true,
    }

    await service.updateData(null, 'shop.example.com', data)

    expect(tx.offerProduct.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triggerProduct: expect.objectContaining({
            update: expect.objectContaining({
              data: expect.objectContaining({ pageIds: [] }),
            }),
          }),
        }),
      }),
    )
  })

  it('returns a clear error when an offer has no trigger product', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 7,
      fallBackProduct: null,
      triggerProduct: null,
    })
    const service = new RecommenderService(
      createPrisma({ offerProduct: { findFirst } }),
      createListProductService(),
      createCatalogSyncService(),
      createRecommendationCache(),
    )
    const data: UpdateProductRecommenderDto = {
      id: '7',
      name: 'Related products',
      placeId: 0,
      productGroups: { id: '10', typeId: [], ids: [], rules: [] },
      trigger: {
        id: '8',
        productGroups: { id: '9', typeId: [], ids: [], rules: [] },
      },
      fallback: {
        id: '',
        productGroups: { id: '', typeId: [], ids: [], rules: [] },
      },
      scheduleOn: true,
    }

    await expect(
      service.updateData(null, 'shop.example.com', data),
    ).rejects.toThrow('OfferProduct 7 has no trigger product')
  })

  it('rejects updates for an offer owned by another shop', async () => {
    const findFirst = jest.fn().mockResolvedValue(null)
    const service = new RecommenderService(
      createPrisma({ offerProduct: { findFirst } }),
      createListProductService(),
      createCatalogSyncService(),
      createRecommendationCache(),
    )
    const data: UpdateProductRecommenderDto = {
      id: '7',
      name: 'Related products',
      placeId: 0,
      productGroups: { id: '10', typeId: [], ids: [], rules: [] },
      trigger: {
        id: '8',
        pageIds: [],
        productGroups: { id: '9', typeId: [], ids: [], rules: [] },
      },
      fallback: {
        id: '',
        productGroups: { id: '', typeId: [], ids: [], rules: [] },
      },
      scheduleOn: true,
    }

    await expect(
      service.updateData(null, 'other-shop.example.com', data),
    ).rejects.toThrow('OfferProduct with id 7 not found')
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 7, shopId: 'other-shop.example.com' },
      select: {
        id: true,
        fallBackProduct: {
          select: { id: true },
        },
        triggerProduct: {
          select: { pageIds: true },
        },
      },
    })
  })
})
