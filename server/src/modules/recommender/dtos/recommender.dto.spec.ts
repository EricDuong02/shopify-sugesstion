import { ValidationPipe } from '@nestjs/common'
import { CreateProductRecommenderDto } from './create-product-recommender.dto'

const validPayload = {
  name: 'Related products',
  placeId: 0,
  productGroups: { typeId: [], ids: [], rules: [] },
  trigger: {
    pageIds: ['1', '4'],
    productGroups: { typeId: [], ids: [], rules: [] },
  },
  fallback: { productGroups: { typeId: [], ids: [], rules: [] } },
  scheduleOn: true,
}

describe('recommendation DTO boundary', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })

  it('transforms the numeric place ID and preserves the wire page IDs', async () => {
    const result = await pipe.transform(validPayload, {
      type: 'body',
      metatype: CreateProductRecommenderDto,
      data: '',
    })

    expect(result.placeId).toBe(0)
    expect(result.trigger.pageIds).toEqual(['1', '4'])
  })

  it('rejects unsupported page IDs', async () => {
    await expect(
      pipe.transform(
        {
          ...validPayload,
          trigger: {
            ...validPayload.trigger,
            pageIds: ['9'],
          },
        },
        { type: 'body', metatype: CreateProductRecommenderDto, data: '' },
      ),
    ).rejects.toThrow()
  })

  it('rejects a string place ID instead of coercing it', async () => {
    await expect(
      pipe.transform(
        { ...validPayload, placeId: '0' },
        { type: 'body', metatype: CreateProductRecommenderDto, data: '' },
      ),
    ).rejects.toThrow()
  })

  it('rejects extra properties at the recommender boundary', async () => {
    await expect(
      pipe.transform(
        { ...validPayload, unexpected: true },
        { type: 'body', metatype: CreateProductRecommenderDto, data: '' },
      ),
    ).rejects.toThrow()
  })
})
