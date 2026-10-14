import { RecommenderController } from './recommender.controller'
import { RecommenderService } from '../services/recommender.service'

describe('RecommenderController dashboard response', () => {
  it('does not expose legacy trigger placement data', async () => {
    const getData = jest.fn().mockResolvedValue([
      {
        id: 7,
        name: 'Related products',
        products: [],
        triggerProduct: {
          scheduleOn: true,
          productGroups: [{ rules: [] }],
        },
      },
    ])
    const service = Object.assign(
      new RecommenderService(null, null, null, null),
      { getData },
    )
    const controller = new RecommenderController(service)

    const result = await controller.getData(
      null,
      { shop: 'shop-a.myshopify.com' },
      { id: '7' },
    )

    expect(result).toEqual([
      {
        id: 7,
        name: 'Related products',
        condition: '',
        active: true,
        products: [],
      },
    ])
    expect(result[0]).not.toHaveProperty('trigger')
  })
})
