import { ValidationPipe } from '@nestjs/common'
import { PageType } from '@/types/RecommendApi'
import { ThemeCampaignsDto } from './theme-campaigns.dto'

describe('ThemeCampaignsDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })

  it('accepts a supported page context and optional limit', async () => {
    await expect(
      pipe.transform(
        { pageType: PageType.home, limit: '10', productLimit: '8' },
        { type: 'query', metatype: ThemeCampaignsDto, data: '' },
      ),
    ).resolves.toEqual({
      pageType: PageType.home,
      limit: '10',
      productLimit: '8',
    })
  })

  it('rejects an invalid campaign limit', async () => {
    await expect(
      pipe.transform(
        { pageType: PageType.home, limit: '0' },
        { type: 'query', metatype: ThemeCampaignsDto, data: '' },
      ),
    ).rejects.toThrow()
  })

  it('rejects unsupported page contexts', async () => {
    await expect(
      pipe.transform(
        { pageType: PageType.blog_post },
        { type: 'query', metatype: ThemeCampaignsDto, data: '' },
      ),
    ).rejects.toThrow()
  })

  it('rejects unknown query properties', async () => {
    await expect(
      pipe.transform(
        { pageType: PageType.home, id: '12' },
        { type: 'query', metatype: ThemeCampaignsDto, data: '' },
      ),
    ).rejects.toThrow()
  })
})
