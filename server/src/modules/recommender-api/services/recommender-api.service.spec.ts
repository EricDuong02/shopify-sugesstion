import { NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/shared/services/prisma.service'
import { ListProductService } from './list-product.service'
import { RecommendDto } from '../dtos/recommends.dto'
import { ThemeRecommendationDto } from '../dtos/theme-recommendation.dto'
import { PageType } from '@/types/RecommendApi'
import { RecommenderApiService } from './recommender-api.service'
import {
  RecommendationCacheService,
  RecommendationRedisClient,
  RecommendationSnapshot,
} from '../../recommendation-cache/services/recommendation-cache.service'

const createPrisma = (overrides: Record<string, unknown> = {}) =>
  Object.assign(new PrismaService(), overrides)

const recommendQuery: RecommendDto = {
  id: '12',
  limit: '',
  customerId: '',
}
const publishedAt = new Date('2026-01-01T00:00:00.000Z')
const HOME_PLACEMENT_ID = 1
const PRODUCT_PLACEMENT_ID = 4
const DEFAULT_THEME_PRODUCT_LIMIT = 8
const MAX_THEME_PRODUCT_LIMIT = 50

const createRedis = (): RecommendationRedisClient => ({
  get: jest.fn().mockResolvedValue(null),
  increment: jest.fn().mockResolvedValue(1),
  setEx: jest.fn().mockResolvedValue('OK'),
  setLock: jest.fn().mockResolvedValue('OK'),
  releaseLock: jest.fn().mockResolvedValue(undefined),
})

const createCache = (
  getOrLoad = jest.fn(
    async (
      _shop: string,
      _offerId: number,
      _pageType: PageType,
      _limit: number,
      loader: () => Promise<RecommendationSnapshot>,
    ) => loader(),
  ),
) => Object.assign(new RecommendationCacheService(createRedis()), { getOrLoad })

const createService = (
  prisma: PrismaService,
  cache: RecommendationCacheService = createCache(),
) =>
  new RecommenderApiService(prisma, new ListProductService(null, null), cache)

describe('RecommenderApiService tenant isolation', () => {
  it('passes exact storefront cache dimensions and serves a cache hit without Prisma', async () => {
    const findFirst = jest.fn()
    const cachedSnapshot: RecommendationSnapshot = {
      id: 12,
      name: 'Cached campaign',
      products: [],
    }
    const getOrLoad = jest.fn().mockResolvedValue(cachedSnapshot)
    const service = createService(
      createPrisma({ offerProduct: { findFirst } }),
      createCache(getOrLoad),
    )

    await expect(
      service.getThemeData(
        { id: '12', pageType: PageType.product, limit: '4' },
        'shop-a.myshopify.com',
      ),
    ).resolves.toBe(cachedSnapshot)

    expect(getOrLoad).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      12,
      PageType.product,
      4,
      expect.any(Function),
    )
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('returns an active campaign snapshot for the requested theme page', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 12,
      name: 'Related products',
      triggerProduct: {
        scheduleOn: true,
        pageIds: [PRODUCT_PLACEMENT_ID],
      },
      items: [
        {
          catalogProduct: {
            shopifyProductId: '101',
            onlineStoreUrl: 'https://shop-a.myshopify.com/products/a',
            featuredImageUrl: null,
            title: 'Product A',
            handle: 'product-a',
            status: 'ACTIVE',
            publishedAt,
            minPrice: 12.5,
          },
        },
      ],
    })
    const service = createService(createPrisma({ offerProduct: { findFirst } }))
    const query: ThemeRecommendationDto = {
      id: '12',
      pageType: PageType.product,
      limit: '4',
    }

    await expect(
      service.getThemeData(query, 'shop-a.myshopify.com'),
    ).resolves.toEqual({
      id: 12,
      name: 'Related products',
      products: [
        {
          id: '101',
          url: 'https://shop-a.myshopify.com/products/a',
          avatarSource: null,
          name: 'Product A',
          handle: 'product-a',
          status: 'ACTIVE',
          price: 12.5,
        },
      ],
    })

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-a.myshopify.com',
        id: 12,
      },
      select: expect.objectContaining({
        triggerProduct: {
          select: { scheduleOn: true, pageIds: true },
        },
        items: expect.objectContaining({
          where: {
            shopId: 'shop-a.myshopify.com',
            catalogProduct: {
              status: 'ACTIVE',
              publishedAt: expect.objectContaining({
                not: null,
                lte: expect.any(Date),
              }),
            },
          },
          orderBy: { position: 'asc' },
          take: 4,
        }),
      }),
    })
  })

  it('falls back to the storefront handle when Shopify has no online store URL', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 12,
      name: 'Related products',
      triggerProduct: {
        scheduleOn: true,
        pageIds: [HOME_PLACEMENT_ID],
      },
      items: [
        {
          catalogProduct: {
            shopifyProductId: '101',
            onlineStoreUrl: null,
            featuredImageUrl: null,
            title: 'Product A',
            handle: 'product-a',
            status: 'ACTIVE',
            publishedAt,
            minPrice: 12.5,
          },
        },
      ],
    })
    const service = createService(createPrisma({ offerProduct: { findFirst } }))

    await expect(
      service.getThemeData(
        { id: '12', pageType: PageType.home },
        'shop-a.myshopify.com',
      ),
    ).resolves.toMatchObject({
      products: [{ id: '101', url: '/products/product-a' }],
    })
  })

  it('returns an empty snapshot for an inactive or wrong-page campaign', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 12,
      name: 'Related products',
      triggerProduct: {
        scheduleOn: false,
        pageIds: [PRODUCT_PLACEMENT_ID],
      },
      items: [],
    })
    const service = createService(createPrisma({ offerProduct: { findFirst } }))

    await expect(
      service.getThemeData(
        { id: '12', pageType: PageType.home },
        'shop-b.myshopify.com',
      ),
    ).resolves.toEqual({
      id: 12,
      name: 'Related products',
      products: [],
    })
  })

  it('returns an empty snapshot for a campaign configured on another page', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 12,
      name: 'Related products',
      triggerProduct: {
        scheduleOn: true,
        pageIds: [PRODUCT_PLACEMENT_ID],
      },
      items: [],
    })
    const service = createService(createPrisma({ offerProduct: { findFirst } }))

    await expect(
      service.getThemeData(
        { id: '12', pageType: PageType.home },
        'shop-a.myshopify.com',
      ),
    ).resolves.toEqual({
      id: 12,
      name: 'Related products',
      products: [],
    })
  })

  it('returns not found when the campaign does not exist', async () => {
    const findFirst = jest.fn().mockResolvedValue(null)
    const service = createService(createPrisma({ offerProduct: { findFirst } }))

    await expect(
      service.getThemeData(
        { id: '12', pageType: PageType.home },
        'shop-a.myshopify.com',
      ),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('filters products that are unpublished, inactive, or unsafe for storefront output', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 12,
      name: 'Related products',
      triggerProduct: {
        scheduleOn: true,
        pageIds: [HOME_PLACEMENT_ID],
      },
      items: [
        {
          catalogProduct: {
            shopifyProductId: '101',
            onlineStoreUrl: 'javascript:alert(1)',
            featuredImageUrl: 'data:image/png;base64,unsafe',
            title: 'Unsafe product',
            handle: 'unsafe-product',
            status: 'ACTIVE',
            publishedAt,
            minPrice: 10,
          },
        },
        {
          catalogProduct: {
            shopifyProductId: '102',
            onlineStoreUrl: 'https://shop-a.myshopify.com/products/archived',
            featuredImageUrl: null,
            title: 'Archived product',
            handle: 'archived-product',
            status: 'ARCHIVED',
            publishedAt,
            minPrice: 10,
          },
        },
        {
          catalogProduct: {
            shopifyProductId: '103',
            onlineStoreUrl: 'https://shop-a.myshopify.com/products/unpublished',
            featuredImageUrl: null,
            title: 'Unpublished product',
            handle: 'unpublished-product',
            status: 'ACTIVE',
            publishedAt: null,
            minPrice: 10,
          },
        },
        {
          catalogProduct: {
            shopifyProductId: '104',
            onlineStoreUrl: 'https://shop-a.myshopify.com/products/safe',
            featuredImageUrl: 'data:image/png;base64,unsafe',
            title: 'Safe product',
            handle: 'safe-product',
            status: 'ACTIVE',
            publishedAt,
            minPrice: 11,
          },
        },
      ],
    })
    const service = createService(createPrisma({ offerProduct: { findFirst } }))

    await expect(
      service.getThemeData(
        { id: '12', pageType: PageType.home },
        'shop-a.myshopify.com',
      ),
    ).resolves.toEqual({
      id: 12,
      name: 'Related products',
      products: [
        {
          id: '104',
          url: 'https://shop-a.myshopify.com/products/safe',
          avatarSource: null,
          name: 'Safe product',
          handle: 'safe-product',
          status: 'ACTIVE',
          price: 11,
        },
      ],
    })
  })

  it('uses the default storefront product limit', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 12,
      name: 'Related products',
      triggerProduct: {
        scheduleOn: true,
        pageIds: [HOME_PLACEMENT_ID],
      },
      items: [],
    })
    const service = createService(createPrisma({ offerProduct: { findFirst } }))

    await service.getThemeData(
      { id: '12', pageType: PageType.home },
      'shop-a.myshopify.com',
    )

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          items: expect.objectContaining({ take: DEFAULT_THEME_PRODUCT_LIMIT }),
        }),
      }),
    )
  })

  it.each(['0', 'not-a-number'])(
    'rejects an invalid storefront product limit: %s',
    async (limit) => {
      const findFirst = jest.fn()
      const service = createService(
        createPrisma({ offerProduct: { findFirst } }),
      )

      await expect(
        service.getThemeData(
          { id: '12', pageType: PageType.home, limit },
          'shop-a.myshopify.com',
        ),
      ).rejects.toThrow('Recommendation product limit must be positive')
      expect(findFirst).not.toHaveBeenCalled()
    },
  )

  it('caps the storefront product limit', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 12,
      name: 'Related products',
      triggerProduct: {
        scheduleOn: true,
        pageIds: [HOME_PLACEMENT_ID],
      },
      items: [],
    })
    const service = createService(createPrisma({ offerProduct: { findFirst } }))

    await service.getThemeData(
      { id: '12', pageType: PageType.home, limit: '500' },
      'shop-a.myshopify.com',
    )

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          items: expect.objectContaining({ take: MAX_THEME_PRODUCT_LIMIT }),
        }),
      }),
    )
  })

  it('reads persisted products only through the requested shop scope', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 12,
      name: 'Related products',
      items: [
        {
          catalogProduct: {
            shopifyProductId: 'gid://shopify/Product/101',
            onlineStoreUrl: 'https://shop-a.myshopify.com/products/a',
            featuredImageUrl: null,
            title: 'Product A',
            handle: 'product-a',
            status: 'ACTIVE',
            minPrice: 12.5,
          },
        },
      ],
    })
    const service = createService(createPrisma({ offerProduct: { findFirst } }))

    await expect(
      service.getPersistedData(recommendQuery, 'shop-a.myshopify.com'),
    ).resolves.toEqual({
      id: 12,
      name: 'Related products',
      products: [
        {
          id: 'gid://shopify/Product/101',
          url: 'https://shop-a.myshopify.com/products/a',
          avatarSource: null,
          name: 'Product A',
          handle: 'product-a',
          status: 'ACTIVE',
          price: 12.5,
        },
      ],
    })

    expect(findFirst).toHaveBeenCalledWith({
      where: { shopId: 'shop-a.myshopify.com', id: 12 },
      select: {
        id: true,
        name: true,
        items: {
          where: { shopId: 'shop-a.myshopify.com' },
          orderBy: { position: 'asc' },
          select: {
            catalogProduct: {
              select: {
                shopifyProductId: true,
                onlineStoreUrl: true,
                featuredImageUrl: true,
                title: true,
                handle: true,
                status: true,
                minPrice: true,
              },
            },
          },
        },
      },
    })
  })

  it('does not return an offer when it is absent for the requested shop', async () => {
    const findFirst = jest.fn().mockResolvedValue(null)
    const service = createService(createPrisma({ offerProduct: { findFirst } }))

    await expect(
      service.getPersistedData(recommendQuery, 'shop-b.myshopify.com'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop-b.myshopify.com', id: 12 },
      }),
    )
  })

  it('lists eligible theme campaigns with tenant-scoped products', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 2,
        name: 'Second campaign',
        items: [
          {
            catalogProduct: {
              shopifyProductId: '102',
              onlineStoreUrl: 'https://shop-a.myshopify.com/products/second',
              featuredImageUrl: null,
              title: 'Second product',
              handle: 'second',
              status: 'ACTIVE',
              publishedAt,
              minPrice: 20,
            },
          },
        ],
      },
      {
        id: 1,
        name: 'Empty campaign',
        items: [],
      },
    ])
    const service = createService(createPrisma({ offerProduct: { findMany } }))

    await expect(
      service.getThemeCampaigns(
        { pageType: PageType.product, limit: '6', productLimit: '6' },
        'shop-a.myshopify.com',
      ),
    ).resolves.toEqual({
      campaigns: [
        {
          id: 2,
          name: 'Second campaign',
          products: [
            {
              id: '102',
              url: 'https://shop-a.myshopify.com/products/second',
              avatarSource: null,
              name: 'Second product',
              handle: 'second',
              status: 'ACTIVE',
              price: 20,
            },
          ],
        },
      ],
    })

    expect(findMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-a.myshopify.com',
        triggerProduct: {
          is: { scheduleOn: true, pageIds: { has: PRODUCT_PLACEMENT_ID } },
        },
        items: {
          some: {
            shopId: 'shop-a.myshopify.com',
            catalogProduct: {
              status: 'ACTIVE',
              publishedAt: expect.objectContaining({
                not: null,
                lte: expect.any(Date),
              }),
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: 6,
      select: expect.objectContaining({
        items: expect.objectContaining({
          where: {
            shopId: 'shop-a.myshopify.com',
            catalogProduct: {
              status: 'ACTIVE',
              publishedAt: expect.objectContaining({
                not: null,
                lte: expect.any(Date),
              }),
            },
          },
          orderBy: { position: 'asc' },
          take: 6,
        }),
      }),
    })
  })

  it('returns only campaign identifiers and names for the theme selector', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 2, name: 'Second campaign' },
      { id: 5, name: 'Another campaign' },
    ])
    const service = createService(createPrisma({ offerProduct: { findMany } }))

    await expect(
      service.getThemeCampaignList(
        { pageType: PageType.product, limit: '10' },
        'shop-a.myshopify.com',
      ),
    ).resolves.toEqual({
      campaigns: [
        { id: 2, name: 'Second campaign' },
        { id: 5, name: 'Another campaign' },
      ],
    })

    expect(findMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-a.myshopify.com',
        triggerProduct: {
          is: { scheduleOn: true, pageIds: { has: PRODUCT_PLACEMENT_ID } },
        },
        items: {
          some: {
            shopId: 'shop-a.myshopify.com',
            catalogProduct: {
              status: 'ACTIVE',
              publishedAt: expect.objectContaining({
                not: null,
                lte: expect.any(Date),
              }),
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: 10,
      select: { id: true, name: true },
    })
  })

  it.each([
    ['home', 1],
    ['cart', 2],
    ['collection', 3],
    ['product', 4],
  ])('lists only active offers on the %s page', async (pageType, pageId) => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 1, name: 'Page offer' }])
    const service = createService(createPrisma({ offerProduct: { findMany } }))

    await expect(
      service.getManyData(
        pageType,
        20,
        undefined,
        undefined,
        'shop-a.myshopify.com',
      ),
    ).resolves.toEqual([{ id: 1, name: 'Page offer' }])

    expect(findMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-a.myshopify.com',
        name: { search: undefined },
        triggerProduct: {
          is: {
            pageIds: { hasSome: [pageId] },
            scheduleOn: true,
          },
        },
      },
      take: 20,
    })
  })

  it('rejects placements that have no supported page mapping', async () => {
    const service = createService(
      createPrisma({ offerProduct: { findMany: jest.fn() } }),
    )

    await expect(
      service.getManyData(
        'blog_post',
        20,
        undefined,
        undefined,
        'shop-a.myshopify.com',
      ),
    ).rejects.toThrow('not supported by recommendation placements')
  })
})
