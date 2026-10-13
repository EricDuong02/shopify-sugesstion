import { NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/shared/services/prisma.service'
import { ListProductService } from './list-product.service'
import { RecommendDto } from '../dtos/recommends.dto'
import { ThemeRecommendationDto } from '../dtos/theme-recommendation.dto'
import { PageType } from '@/types/RecommendApi'
import { RecommenderApiService } from './recommender-api.service'

const createPrisma = (overrides: Record<string, unknown> = {}) =>
  Object.assign(new PrismaService(), overrides)

const recommendQuery: RecommendDto = {
  id: '12',
  limit: '',
  customerId: '',
}

const createService = (prisma: PrismaService) =>
  new RecommenderApiService(prisma, new ListProductService(null, null))

describe('RecommenderApiService tenant isolation', () => {
  it('returns an active campaign snapshot for the requested theme page', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 12,
      name: 'Related products',
      items: [
        {
          catalogProduct: {
            shopifyProductId: '101',
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
        triggerProduct: {
          is: {
            scheduleOn: true,
            pageIds: { has: 4 },
          },
        },
      },
      select: expect.objectContaining({
        items: expect.objectContaining({
          where: { shopId: 'shop-a.myshopify.com' },
          orderBy: { position: 'asc' },
          take: 4,
        }),
      }),
    })
  })

  it('does not return an inactive or wrong-page campaign', async () => {
    const findFirst = jest.fn().mockResolvedValue(null)
    const service = createService(createPrisma({ offerProduct: { findFirst } }))

    await expect(
      service.getThemeData(
        { id: '12', pageType: PageType.home },
        'shop-b.myshopify.com',
      ),
    ).rejects.toThrow(
      'Active OfferProduct with id 12 is not configured for home',
    )
  })

  it('caps the storefront product limit', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 12,
      name: 'Related products',
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
          items: expect.objectContaining({ take: 50 }),
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
