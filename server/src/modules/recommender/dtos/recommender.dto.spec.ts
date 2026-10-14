import { ValidationPipe } from '@nestjs/common'
import { CreateProductRecommenderDto } from './create-product-recommender.dto'
import { UpdateProductRecommenderDto } from './update-product-recommender.dto'

const validPayload = {
  name: 'Related products',
  placeId: 0,
  productGroups: { typeId: [], ids: [], rules: [] },
  trigger: {
    productGroups: { typeId: [], ids: [], rules: [] },
  },
  fallback: { productGroups: { typeId: [], ids: [], rules: [] } },
  scheduleOn: true,
}

const validUpdatePayload = {
  id: '7',
  ...validPayload,
  productGroups: { id: '10', typeId: [], ids: [], rules: [] },
  trigger: {
    id: '8',
    productGroups: { id: '9', typeId: [], ids: [], rules: [] },
  },
  fallback: {
    id: '11',
    productGroups: { id: '12', typeId: [], ids: [], rules: [] },
  },
}

describe('recommendation DTO boundary', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })

  it('transforms the numeric place ID without requiring placement data', async () => {
    const result = await pipe.transform(validPayload, {
      type: 'body',
      metatype: CreateProductRecommenderDto,
      data: '',
    })

    expect(result.placeId).toBe(0)
    expect(result.trigger.pageIds).toBeUndefined()
  })

  it('accepts legacy placement data for backward compatibility', async () => {
    const result = await pipe.transform(
      {
        ...validPayload,
        trigger: {
          ...validPayload.trigger,
          pageIds: ['1', '4'],
        },
      },
      { type: 'body', metatype: CreateProductRecommenderDto, data: '' },
    )

    expect(result.trigger.pageIds).toEqual(['1', '4'])
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

  it('accepts an update without legacy placement data', async () => {
    const result = await pipe.transform(validUpdatePayload, {
      type: 'body',
      metatype: UpdateProductRecommenderDto,
      data: '',
    })

    expect(result.trigger.pageIds).toBeUndefined()
  })

  it('accepts legacy placement data on update', async () => {
    const result = await pipe.transform(
      {
        ...validUpdatePayload,
        trigger: {
          ...validUpdatePayload.trigger,
          pageIds: ['1', '4'],
        },
      },
      { type: 'body', metatype: UpdateProductRecommenderDto, data: '' },
    )

    expect(result.trigger.pageIds).toEqual(['1', '4'])
  })

  it('rejects unknown nested update properties', async () => {
    await expect(
      pipe.transform(
        {
          ...validUpdatePayload,
          trigger: { ...validUpdatePayload.trigger, unexpected: true },
        },
        { type: 'body', metatype: UpdateProductRecommenderDto, data: '' },
      ),
    ).rejects.toThrow()
  })
})
