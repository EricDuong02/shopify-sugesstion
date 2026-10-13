import { ValidationPipe } from '@nestjs/common'
import { PageType } from '@/types/RecommendApi'
import { ThemeRecommendationDto } from './theme-recommendation.dto'

describe('ThemeRecommendationDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })

  it('accepts a supported page context without a campaign ID', async () => {
    await expect(
      pipe.transform(
        { pageType: PageType.product, limit: '8' },
        { type: 'query', metatype: ThemeRecommendationDto, data: '' },
      ),
    ).resolves.toEqual({ pageType: PageType.product, limit: '8' })
  })

  it('accepts a supported page context and limit', async () => {
    await expect(
      pipe.transform(
        { id: '12', pageType: PageType.product, limit: '8' },
        { type: 'query', metatype: ThemeRecommendationDto, data: '' },
      ),
    ).resolves.toEqual({ id: '12', pageType: PageType.product, limit: '8' })
  })

  it('rejects non-positive campaign IDs', async () => {
    await expect(
      pipe.transform(
        { id: '0', pageType: PageType.home },
        { type: 'query', metatype: ThemeRecommendationDto, data: '' },
      ),
    ).rejects.toThrow()
  })

  it('rejects unsupported page contexts', async () => {
    await expect(
      pipe.transform(
        { id: '12', pageType: PageType.blog_post },
        { type: 'query', metatype: ThemeRecommendationDto, data: '' },
      ),
    ).rejects.toThrow()
  })

  it('accepts Shopify App Proxy transport metadata', async () => {
    await expect(
      pipe.transform(
        {
          id: '12',
          pageType: PageType.home,
          shop: 'shop-a.myshopify.com',
          timestamp: '1770000000',
          signature: 'signature',
          path_prefix: 'apps',
          logged_in_customer_id: 'customer-1',
        },
        { type: 'query', metatype: ThemeRecommendationDto, data: '' },
      ),
    ).resolves.toEqual({
      id: '12',
      pageType: PageType.home,
      shop: 'shop-a.myshopify.com',
      timestamp: '1770000000',
      signature: 'signature',
      path_prefix: 'apps',
      logged_in_customer_id: 'customer-1',
    })
  })

  it('rejects unknown query properties', async () => {
    await expect(
      pipe.transform(
        { id: '12', pageType: PageType.home, unexpected: 'value' },
        { type: 'query', metatype: ThemeRecommendationDto, data: '' },
      ),
    ).rejects.toThrow()
  })
})
