import { INestApplication, VersioningType } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { createHmac } from 'crypto'
import * as request from 'supertest'
import { RecommenderApiController } from './recommender-api.controller'
import { RecommenderApiService } from '../services/recommender-api.service'

describe('RecommenderApiController storefront route', () => {
  let app: INestApplication
  const secret = 'test-shopify-secret'
  const originalSecret = process.env.SHOPIFY_API_SECRET
  const getThemeData = jest.fn()
  const getThemeCampaigns = jest.fn()
  const getThemeCampaignList = jest.fn()

  const signQuery = (query: Record<string, string>) => {
    const message = Object.keys(query)
      .sort()
      .map((key) => `${key}=${query[key]}`)
      .join('')
    return createHmac('sha256', secret).update(message).digest('hex')
  }

  beforeAll(async () => {
    process.env.SHOPIFY_API_SECRET = secret
    const module = await Test.createTestingModule({
      controllers: [RecommenderApiController],
      providers: [
        {
          provide: RecommenderApiService,
          useValue: { getThemeData, getThemeCampaigns, getThemeCampaignList },
        },
      ],
    }).compile()

    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.enableVersioning({ type: VersioningType.URI })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    if (originalSecret === undefined) {
      delete process.env.SHOPIFY_API_SECRET
    } else {
      process.env.SHOPIFY_API_SECRET = originalSecret
    }
  })

  beforeEach(() => {
    getThemeData.mockReset()
    getThemeCampaigns.mockReset()
    getThemeCampaignList.mockReset()
    getThemeData.mockResolvedValue({
      id: 12,
      name: 'Related products',
      products: [],
    })
    getThemeCampaigns.mockResolvedValue({ campaigns: [] })
    getThemeCampaignList.mockResolvedValue({ campaigns: [] })
  })

  it('routes a signed app proxy request through the versioned theme endpoint', async () => {
    const query = {
      shop: 'shop-a.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
      id: '12',
      pageType: 'product',
      limit: '8',
    }

    await request(app.getHttpServer())
      .get('/api/v1/recommender-api/theme')
      .query({ ...query, signature: signQuery(query) })
      .expect(200)
      .expect('Cache-Control', 'private, no-store')
      .expect({ id: 12, name: 'Related products', products: [] })

    expect(getThemeData).toHaveBeenCalledWith(
      { id: '12', pageType: 'product', limit: '8' },
      'shop-a.myshopify.com',
    )
  })

  it('auto-discovers campaigns through the base theme endpoint without an ID', async () => {
    const query = {
      shop: 'shop-a.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
      pageType: 'product',
      productLimit: '8',
    }

    await request(app.getHttpServer())
      .get('/api/v1/recommender-api/theme')
      .query({ ...query, signature: signQuery(query) })
      .expect(200)
      .expect({ campaigns: [] })

    expect(getThemeCampaigns).toHaveBeenCalledWith(
      { pageType: 'product', productLimit: '8' },
      'shop-a.myshopify.com',
    )
  })

  it('routes a signed app proxy request through the campaign list endpoint', async () => {
    const query = {
      shop: 'shop-a.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
      pageType: 'product',
      limit: '8',
      productLimit: '8',
    }

    await request(app.getHttpServer())
      .get('/api/v1/recommender-api/theme/campaigns')
      .query({ ...query, signature: signQuery(query) })
      .expect(200)
      .expect('Cache-Control', 'private, no-store')
      .expect({ campaigns: [] })

    expect(getThemeCampaignList).toHaveBeenCalledWith(
      { pageType: 'product', limit: '8', productLimit: '8' },
      'shop-a.myshopify.com',
    )
  })

  it('rejects a direct campaign list request without a Shopify credential', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/recommender-api/theme/campaigns')
      .query({ pageType: 'product' })
      .expect(401)
  })

  it('rejects a campaign list request with an invalid limit', async () => {
    const query = {
      shop: 'shop-a.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
      pageType: 'product',
      productLimit: '0',
    }

    await request(app.getHttpServer())
      .get('/api/v1/recommender-api/theme/campaigns')
      .query({ ...query, signature: signQuery(query) })
      .expect(400)
  })

  it('rejects a direct backend request without a Shopify credential', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/recommender-api/theme')
      .query({ id: '12', pageType: 'product' })
      .expect(401)
  })
})
