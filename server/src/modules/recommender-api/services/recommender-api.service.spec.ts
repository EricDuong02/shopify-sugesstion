import { NotFoundException } from '@nestjs/common'
import { RecommenderApiService } from './recommender-api.service'

describe('RecommenderApiService tenant isolation', () => {
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
    const service = new RecommenderApiService(
      { offerProduct: { findFirst } } as any,
      {} as any,
    )

    await expect(
      service.getPersistedData({ id: '12' } as any, 'shop-a.myshopify.com'),
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
    const service = new RecommenderApiService(
      { offerProduct: { findFirst } } as any,
      {} as any,
    )

    await expect(
      service.getPersistedData({ id: '12' } as any, 'shop-b.myshopify.com'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop-b.myshopify.com', id: 12 },
      }),
    )
  })
})
