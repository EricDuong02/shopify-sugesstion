import { RecommenderService } from './recommender.service'

describe('RecommenderService canonical offer items', () => {
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

  it('normalizes GID and numeric IDs and keeps fallback order', async () => {
    const prisma = {
      catalogProduct: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { shopifyProductId: '101' },
            { shopifyProductId: '102' },
            { shopifyProductId: '103' },
            { shopifyProductId: '104' },
          ]),
      },
    }
    const listProductService = {
      getDataByCondition: jest
        .fn()
        .mockResolvedValue([{ id: 'gid://shopify/Product/102' }]),
    }
    const service = new RecommenderService(
      prisma as any,
      listProductService as any,
    )

    const result = await (service as any).resolveOfferItems(
      {},
      'shop.example.com',
      {
        ...triggerGroup,
        typeId: ['3'],
        rules: [{ column: '0', relation: '3', value: ['SKU-1'] }],
      },
      fallbackGroup,
    )

    expect(prisma.catalogProduct.findMany).toHaveBeenCalledWith({
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

  it('rejects canonical resolution when catalog sync is incomplete', async () => {
    const service = new RecommenderService(
      {
        catalogProduct: {
          findMany: jest.fn().mockResolvedValue([{ shopifyProductId: '101' }]),
        },
      } as any,
      { getDataByCondition: jest.fn() } as any,
    )

    await expect(
      (service as any).resolveOfferItems(
        {},
        'shop.example.com',
        triggerGroup,
        fallbackGroup,
      ),
    ).rejects.toThrow('Catalog sync is incomplete')
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
    const prisma = {
      catalogProduct: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { shopifyProductId: '101' },
            { shopifyProductId: '999' },
          ]),
      },
      $transaction: jest.fn(async (callback) => callback(tx)),
    }
    const service = new RecommenderService(
      prisma as any,
      {
        getDataByCondition: jest.fn(),
      } as any,
    )

    await service.createData({} as any, 'shop.example.com', {
      name: 'Related products',
      placeId: '0',
      productGroups: {
        typeId: [],
        ids: ['gid://shopify/Product/999'],
        rules: [],
      },
      trigger: {
        pageIds: [],
        productGroups: triggerGroup,
      },
      fallback: { productGroups: { typeId: [], ids: [], rules: [] } },
      scheduleOn: true,
    } as any)

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
  })

  it('filters admin items by the requested shop', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const service = new RecommenderService(
      { offerProduct: { findMany } } as any,
      {} as any,
    )

    await service.getData('shop-a.myshopify.com', { id: '7' } as any)

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
    const prisma = {
      offerProduct: {
        findFirst: jest.fn().mockResolvedValue({ id: 7 }),
      },
      rules: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      catalogProduct: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (callback) => callback(tx)),
    }
    const service = new RecommenderService(
      prisma as any,
      {
        getDataByCondition: jest.fn(),
      } as any,
    )

    await service.updateData({} as any, 'shop.example.com', {
      id: '7',
      name: 'Related products',
      placeId: '0',
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
    } as any)

    expect(tx.offerProductItem.deleteMany).toHaveBeenCalledWith({
      where: { offerProductId: 7, shopId: 'shop.example.com' },
    })
    expect(tx.offerProductItem.createMany).not.toHaveBeenCalled()
  })

  it('rejects updates for an offer owned by another shop', async () => {
    const prisma = {
      offerProduct: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }
    const service = new RecommenderService(prisma as any, {} as any)

    await expect(
      service.updateData({} as any, 'other-shop.example.com', {
        id: '7',
      } as any),
    ).rejects.toThrow('OfferProduct with id 7 not found')
    expect(prisma.offerProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 7, shopId: 'other-shop.example.com' },
      select: { id: true },
    })
  })
})
