import { ValidationPipe } from '@nestjs/common'
import { PageType } from '@/types/RecommendApi'
import { ThemeRecommendationDto } from './theme-recommendation.dto'

describe('ThemeRecommendationDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
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

  it('rejects unknown query properties', async () => {
    await expect(
      pipe.transform(
        { id: '12', pageType: PageType.home, shop: 'other-shop.myshopify.com' },
        { type: 'query', metatype: ThemeRecommendationDto, data: '' },
      ),
    ).rejects.toThrow()
  })
})
