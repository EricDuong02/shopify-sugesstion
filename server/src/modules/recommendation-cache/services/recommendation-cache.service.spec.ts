import {
  createRecommendationRedisClient,
  RecommendationCacheService,
  RecommendationRedisClient,
  RecommendationSnapshot,
} from './recommendation-cache.service'

const LOCK_WAIT_ATTEMPTS = 100

const snapshot: RecommendationSnapshot = {
  id: 7,
  name: 'Related products',
  products: [
    {
      id: '101',
      url: '/products/product-a',
      avatarSource: null,
      name: 'Product A',
      handle: 'product-a',
      status: 'ACTIVE',
      price: 12.5,
    },
  ],
}

const createRedis = (
  overrides: Partial<RecommendationRedisClient> = {},
): RecommendationRedisClient => ({
  get: jest.fn().mockResolvedValue(null),
  increment: jest.fn().mockResolvedValue(1),
  setEx: jest.fn().mockResolvedValue('OK'),
  setLock: jest.fn().mockResolvedValue('OK'),
  releaseLock: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

describe('createRecommendationRedisClient', () => {
  it('maps cache operations to the Redis connection API', async () => {
    const connection = {
      get: jest.fn().mockResolvedValue('payload'),
      incr: jest.fn().mockResolvedValue(3),
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    }
    const client = createRecommendationRedisClient(connection)

    await expect(client.get('payload-key')).resolves.toBe('payload')
    await expect(client.increment('generation-key')).resolves.toBe(3)
    await expect(client.setEx('payload-key', 'value', 60)).resolves.toBe('OK')
    await expect(client.setLock('lock-key', 'token', 5000)).resolves.toBe('OK')
    await client.releaseLock('lock-key', 'token')

    expect(connection.get).toHaveBeenCalledWith('payload-key')
    expect(connection.incr).toHaveBeenCalledWith('generation-key')
    expect(connection.set).toHaveBeenNthCalledWith(
      1,
      'payload-key',
      'value',
      'EX',
      60,
    )
    expect(connection.set).toHaveBeenNthCalledWith(
      2,
      'lock-key',
      'token',
      'PX',
      5000,
      'NX',
    )
    expect(connection.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get", KEYS[1])'),
      1,
      'lock-key',
      'token',
    )
  })
})

describe('RecommendationCacheService', () => {
  it('returns a valid cached snapshot without loading the database', async () => {
    const get = jest.fn().mockImplementation(async (key: string) => {
      if (key.includes(':generation:')) return '0'
      return JSON.stringify(snapshot)
    })
    const redis = createRedis({ get })
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('Shop-A.myshopify.com', 7, 'product', 4, loader),
    ).resolves.toEqual(snapshot)

    expect(loader).not.toHaveBeenCalled()
    expect(redis.setLock).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledWith(
      'recommendation:theme:v1:shop-a.myshopify.com:7:product:4:g0',
    )
  })

  it('loads and caches a snapshot on a miss', async () => {
    const redis = createRedis()
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)

    expect(loader).toHaveBeenCalledTimes(1)
    expect(redis.setLock).toHaveBeenCalledWith(
      'recommendation:theme:v1:shop-a.myshopify.com:7:home:8:g0:lock',
      expect.any(String),
      5000,
    )
    expect(redis.setEx).toHaveBeenCalledWith(
      'recommendation:theme:v1:shop-a.myshopify.com:7:home:8:g0',
      JSON.stringify(snapshot),
      60,
    )
    expect(redis.releaseLock).toHaveBeenCalledWith(
      'recommendation:theme:v1:shop-a.myshopify.com:7:home:8:g0:lock',
      expect.any(String),
    )
  })

  it('coalesces concurrent same-key loaders before the first Redis read completes', async () => {
    let resolveLoader: (value: RecommendationSnapshot) => void = () => undefined
    const loaderPromise = new Promise<RecommendationSnapshot>((resolve) => {
      resolveLoader = resolve
    })
    const redis = createRedis()
    const loader = jest.fn().mockReturnValue(loaderPromise)
    const service = new RecommendationCacheService(redis)

    const requests = Array.from({ length: 5 }, () =>
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    )

    expect(loader).toHaveBeenCalledTimes(0)
    resolveLoader(snapshot)

    await expect(Promise.all(requests)).resolves.toEqual(
      Array.from({ length: 5 }, () => snapshot),
    )
    expect(loader).toHaveBeenCalledTimes(1)
    expect(redis.setEx).toHaveBeenCalledTimes(1)
    expect(redis.releaseLock).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent loaders when the generation read fails', async () => {
    let resolveLoader: (value: RecommendationSnapshot) => void = () => undefined
    const loaderPromise = new Promise<RecommendationSnapshot>((resolve) => {
      resolveLoader = resolve
    })
    const redis = createRedis({
      get: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    })
    const loader = jest.fn().mockReturnValue(loaderPromise)
    const service = new RecommendationCacheService(redis)

    const requests = Array.from({ length: 4 }, () =>
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    )

    expect(loader).toHaveBeenCalledTimes(0)
    resolveLoader(snapshot)
    await expect(Promise.all(requests)).resolves.toEqual(
      Array.from({ length: 4 }, () => snapshot),
    )
    expect(loader).toHaveBeenCalledTimes(1)
    expect(redis.setEx).not.toHaveBeenCalled()
  })

  it('coalesces concurrent loaders when the generation is malformed', async () => {
    let resolveLoader: (value: RecommendationSnapshot) => void = () => undefined
    const loaderPromise = new Promise<RecommendationSnapshot>((resolve) => {
      resolveLoader = resolve
    })
    const redis = createRedis({
      get: jest
        .fn()
        .mockImplementation(async (key: string) =>
          key.includes(':generation:') ? '' : JSON.stringify(snapshot),
        ),
    })
    const loader = jest.fn().mockReturnValue(loaderPromise)
    const service = new RecommendationCacheService(redis)

    const requests = Array.from({ length: 4 }, () =>
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    )

    expect(loader).toHaveBeenCalledTimes(0)
    resolveLoader(snapshot)
    await expect(Promise.all(requests)).resolves.toEqual(
      Array.from({ length: 4 }, () => snapshot),
    )
    expect(loader).toHaveBeenCalledTimes(1)
    expect(redis.setEx).not.toHaveBeenCalled()
  })

  it('does not share a valid-generation request with a degraded request', async () => {
    let generation = '0'
    let resolveFirstLoader: (value: RecommendationSnapshot) => void = () =>
      undefined
    const firstLoaderPromise = new Promise<RecommendationSnapshot>(
      (resolve) => {
        resolveFirstLoader = resolve
      },
    )
    const get = jest.fn().mockImplementation(async (key: string) => {
      if (key.includes(':generation:')) return generation
      return null
    })
    const redis = createRedis({ get })
    const firstLoader = jest.fn().mockReturnValue(firstLoaderPromise)
    const secondLoader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    const firstRequest = service.getOrLoad(
      'shop-a.myshopify.com',
      7,
      'home',
      8,
      firstLoader,
    )
    await Promise.resolve()
    generation = ''
    const secondRequest = service.getOrLoad(
      'shop-a.myshopify.com',
      7,
      'home',
      8,
      secondLoader,
    )

    await expect(secondRequest).resolves.toEqual(snapshot)
    expect(secondLoader).toHaveBeenCalledTimes(1)
    expect(firstLoader).toHaveBeenCalledTimes(1)

    resolveFirstLoader(snapshot)
    await expect(firstRequest).resolves.toEqual(snapshot)
  })

  it('separates cache keys by tenant, page, and limit', async () => {
    const get = jest.fn().mockResolvedValue(null)
    const redis = createRedis({ get })
    const service = new RecommendationCacheService(redis)
    const loader = jest.fn().mockResolvedValue(snapshot)

    await service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader)
    await service.getOrLoad('shop-b.myshopify.com', 7, 'product', 4, loader)

    const payloadKeys = get.mock.calls
      .map(([key]) => key)
      .filter((key) => key.startsWith('recommendation:theme:v1'))

    expect(payloadKeys).toEqual([
      'recommendation:theme:v1:shop-a.myshopify.com:7:home:8:g0',
      'recommendation:theme:v1:shop-a.myshopify.com:7:home:8:g0',
      'recommendation:theme:v1:shop-b.myshopify.com:7:product:4:g0',
      'recommendation:theme:v1:shop-b.myshopify.com:7:product:4:g0',
    ])
  })

  it('overwrites malformed cached payloads', async () => {
    const get = jest.fn().mockImplementation(async (key: string) => {
      if (key.includes(':generation:')) return '0'
      return 'malformed-json'
    })
    const redis = createRedis({ get })
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)

    expect(loader).toHaveBeenCalledTimes(1)
    expect(redis.setEx).toHaveBeenCalledTimes(1)
  })

  it.each([
    'null',
    JSON.stringify({ ...snapshot, id: 0 }),
    JSON.stringify({ ...snapshot, id: Number.MAX_SAFE_INTEGER + 1 }),
    JSON.stringify({ ...snapshot, name: ' ' }),
    JSON.stringify({
      ...snapshot,
      products: [{ ...snapshot.products[0], id: '0' }],
    }),
    JSON.stringify({
      ...snapshot,
      products: [{ ...snapshot.products[0], id: 'not-numeric' }],
    }),
    JSON.stringify({
      ...snapshot,
      products: [{ ...snapshot.products[0], name: ' ' }],
    }),
    JSON.stringify({
      ...snapshot,
      products: [{ ...snapshot.products[0], avatarSource: '/images/a.png' }],
    }),
    JSON.stringify({
      ...snapshot,
      products: [
        { ...snapshot.products[0], avatarSource: '//cdn.example/a.png' },
      ],
    }),
    JSON.stringify({
      ...snapshot,
      products: [{ ...snapshot.products[0], url: 'javascript:alert(1)' }],
    }),
    JSON.stringify({
      ...snapshot,
      products: [{ ...snapshot.products[0], price: null }],
    }).replace('"price":null', '"price":1e999'),
  ])(
    'treats a semantically invalid cached payload as a miss: %s',
    async (raw) => {
      const get = jest.fn().mockImplementation(async (key: string) => {
        if (key.includes(':generation:')) return '0'
        return raw
      })
      const redis = createRedis({ get })
      const loader = jest.fn().mockResolvedValue(snapshot)
      const service = new RecommendationCacheService(redis)

      await expect(
        service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
      ).resolves.toEqual(snapshot)

      expect(loader).toHaveBeenCalledTimes(1)
      expect(redis.setEx).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    '',
    ' ',
    '+1',
    '-1',
    '1.5',
    '1e3',
    '01',
    '9007199254740992',
    'not-a-generation',
  ])('loads directly when generation is malformed: %s', async (generation) => {
    const redis = createRedis({
      get: jest
        .fn()
        .mockImplementation(async (key: string) =>
          key.includes(':generation:') ? generation : JSON.stringify(snapshot),
        ),
    })
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)

    expect(loader).toHaveBeenCalledTimes(1)
    expect(redis.setLock).not.toHaveBeenCalled()
    expect(redis.setEx).not.toHaveBeenCalled()
  })

  it('loads directly when Redis is unavailable', async () => {
    const loader = jest.fn().mockResolvedValue(snapshot)
    const redis = createRedis({
      get: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    })
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)

    expect(loader).toHaveBeenCalledTimes(1)
    expect(redis.setLock).not.toHaveBeenCalled()
    expect(redis.setEx).not.toHaveBeenCalled()
  })

  it('loads directly when the cached payload read fails', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce('0')
      .mockRejectedValueOnce(new Error('Redis unavailable'))
    const redis = createRedis({ get })
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)

    expect(loader).toHaveBeenCalledTimes(1)
    expect(redis.setLock).not.toHaveBeenCalled()
    expect(redis.setEx).not.toHaveBeenCalled()
  })

  it('returns fresh data when the cache write fails', async () => {
    const redis = createRedis({
      setEx: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    })
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)
    expect(redis.releaseLock).toHaveBeenCalledTimes(1)
  })

  it('returns fresh data when lock acquisition fails', async () => {
    const redis = createRedis({
      setLock: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    })
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(redis.setEx).not.toHaveBeenCalled()
  })

  it('returns fresh data when lock release fails', async () => {
    const redis = createRedis({
      releaseLock: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    })
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('falls back to the loader after bounded lock polling is exhausted', async () => {
    jest.useFakeTimers()
    try {
      const redis = createRedis({
        setLock: jest.fn().mockResolvedValue(null),
      })
      const loader = jest.fn().mockResolvedValue(snapshot)
      const service = new RecommendationCacheService(redis)
      const request = service.getOrLoad(
        'shop-a.myshopify.com',
        7,
        'home',
        8,
        loader,
      )

      await jest.runAllTimersAsync()
      await expect(request).resolves.toEqual(snapshot)
      expect(redis.setLock).toHaveBeenCalledTimes(LOCK_WAIT_ATTEMPTS + 1)
      expect(loader).toHaveBeenCalledTimes(1)
      expect(redis.setEx).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('rechecks the payload after becoming lock owner', async () => {
    let payloadReads = 0
    const get = jest.fn().mockImplementation(async (key: string) => {
      if (key.includes(':generation:')) return '0'
      payloadReads += 1
      return payloadReads === 1 ? null : JSON.stringify(snapshot)
    })
    const redis = createRedis({ get })
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)

    expect(loader).not.toHaveBeenCalled()
    expect(redis.setEx).not.toHaveBeenCalled()
    expect(redis.releaseLock).toHaveBeenCalledTimes(1)
  })

  it('keeps invalidation fail-open when generation increment fails', async () => {
    const redis = createRedis({
      increment: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    })
    const service = new RecommendationCacheService(redis)

    await expect(
      service.invalidateCampaign('shop-a.myshopify.com', 7),
    ).resolves.toBeUndefined()
  })

  it('can still serve an existing payload when invalidation cannot advance generation', async () => {
    const staleSnapshot = { ...snapshot, name: 'Stale payload' }
    const redis = createRedis({
      get: jest.fn().mockImplementation(async (key: string) => {
        if (key.includes(':generation:')) return '0'
        return JSON.stringify(staleSnapshot)
      }),
      increment: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    })
    const service = new RecommendationCacheService(redis)
    const loader = jest.fn().mockResolvedValue(snapshot)

    await service.invalidateCampaign('shop-a.myshopify.com', 7)
    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(staleSnapshot)
    expect(loader).not.toHaveBeenCalled()
  })

  it('releases the lock and removes the local request after loader rejection', async () => {
    const redis = createRedis()
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).rejects.toThrow('database unavailable')
    expect(redis.releaseLock).toHaveBeenCalledTimes(1)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('uses a populated cache when another process owns the lock', async () => {
    let payloadReads = 0
    const get = jest.fn().mockImplementation(async (key: string) => {
      if (key.includes(':generation:')) return '0'
      payloadReads += 1
      return payloadReads === 1 ? null : JSON.stringify(snapshot)
    })
    const redis = createRedis({
      get,
      setLock: jest.fn().mockResolvedValue(null),
    })
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)

    expect(loader).not.toHaveBeenCalled()
    expect(redis.setEx).not.toHaveBeenCalled()
  })

  it('retries lock ownership after the previous lock expires', async () => {
    const setLock = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('OK')
    const redis = createRedis({ setLock })
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await expect(
      service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader),
    ).resolves.toEqual(snapshot)

    expect(setLock).toHaveBeenCalledTimes(2)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(redis.setEx).toHaveBeenCalledTimes(1)
  })

  it('removes a completed local in-flight request so the next request can reload', async () => {
    const redis = createRedis()
    const loader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    await service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader)
    await service.getOrLoad('shop-a.myshopify.com', 7, 'home', 8, loader)

    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('does not cache a result when invalidation changes its generation', async () => {
    let resolveLoader: (value: RecommendationSnapshot) => void = () => undefined
    const loaderPromise = new Promise<RecommendationSnapshot>((resolve) => {
      resolveLoader = resolve
    })
    let generation = '0'
    const get = jest.fn().mockImplementation(async (key: string) => {
      if (key.includes(':generation:')) return generation
      return null
    })
    const redis = createRedis({ get })
    const loader = jest.fn().mockReturnValue(loaderPromise)
    const service = new RecommendationCacheService(redis)

    const request = service.getOrLoad(
      'shop-a.myshopify.com',
      7,
      'home',
      8,
      loader,
    )
    await Promise.resolve()
    generation = '1'
    await service.invalidateCampaign('shop-a.myshopify.com', 7)
    resolveLoader(snapshot)

    await expect(request).resolves.toEqual(snapshot)
    expect(redis.setEx).not.toHaveBeenCalled()
  })

  it('does not share an older-generation request with a newer request', async () => {
    let generation = '0'
    let resolveLoader: (value: RecommendationSnapshot) => void = () => undefined
    const firstLoaderPromise = new Promise<RecommendationSnapshot>(
      (resolve) => {
        resolveLoader = resolve
      },
    )
    const get = jest.fn().mockImplementation(async (key: string) => {
      if (key.includes(':generation:')) return generation
      return null
    })
    const redis = createRedis({ get })
    const firstLoader = jest.fn().mockReturnValue(firstLoaderPromise)
    const secondLoader = jest.fn().mockResolvedValue(snapshot)
    const service = new RecommendationCacheService(redis)

    const firstRequest = service.getOrLoad(
      'shop-a.myshopify.com',
      7,
      'home',
      8,
      firstLoader,
    )
    await Promise.resolve()
    generation = '1'
    const secondRequest = service.getOrLoad(
      'shop-a.myshopify.com',
      7,
      'home',
      8,
      secondLoader,
    )

    await expect(secondRequest).resolves.toEqual(snapshot)
    expect(secondLoader).toHaveBeenCalledTimes(1)
    expect(firstLoader).toHaveBeenCalledTimes(1)

    resolveLoader(snapshot)
    await expect(firstRequest).resolves.toEqual(snapshot)
  })

  it('deduplicates campaign invalidation IDs', async () => {
    const redis = createRedis()
    const service = new RecommendationCacheService(redis)

    await service.invalidateCampaigns('Shop-A.myshopify.com', [7, 7, 8])

    expect(redis.increment).toHaveBeenCalledWith(
      'recommendation:theme:generation:v1:shop-a.myshopify.com:7',
    )
    expect(redis.increment).toHaveBeenCalledWith(
      'recommendation:theme:generation:v1:shop-a.myshopify.com:8',
    )
    expect(redis.increment).toHaveBeenCalledTimes(2)
  })

  it('bumps only the requested campaign generation during invalidation', async () => {
    const redis = createRedis()
    const service = new RecommendationCacheService(redis)

    await service.invalidateCampaign('Shop-A.myshopify.com', 7)

    expect(redis.increment).toHaveBeenCalledWith(
      'recommendation:theme:generation:v1:shop-a.myshopify.com:7',
    )
    expect(redis.increment).toHaveBeenCalledTimes(1)
  })
})
