import { Product } from '@/types/Recommend'
import { BetaAnalyticsDataClient } from '@google-analytics/data'

export class GoogleAnalyst4 {
  analyticsDataClient: BetaAnalyticsDataClient

  constructor() {
    this.analyticsDataClient = new BetaAnalyticsDataClient()
  }

  async getViewSession(combinedLists: Product[]) {
    try {
      const combinedIdLists = combinedLists.map((data) => data.id)
      const [response] = await this.analyticsDataClient.runReport({
        property: `properties/${process.env.GA4_PROPERTY_ID}`,
        dimensions: [
          {
            name: 'itemId',
          },
        ],
        metrics: [{ name: 'itemsViewed' }],
        dateRanges: [{ startDate: '720daysAgo', endDate: 'today' }],
        ...(combinedIdLists.length > 0 && {
          dimensionFilter: {
            filter: {
              fieldName: 'customEvent:item_id',
              inListFilter: { values: combinedIdLists },
            },
          },
        }),
      })

      const listProduct = response.rows.map((row) => {
        const fullItemId = row.dimensionValues[0].value
        const productId = fullItemId.split('_')[2]
        const itemsViewSession = row.metricValues[0].value
        return { productId, itemsViewSession }
      })

      return listProduct
    } catch (error) {
      console.error('Error fetching report:', error)
    }
  }

  async getAddToCart(combinedLists: Product[]) {
    try {
      const combinedIdLists = combinedLists.map((data) => data.id)
      const [response] = await this.analyticsDataClient.runReport({
        property: `properties/${process.env.GA4_PROPERTY_ID}`,
        metrics: [{ name: 'itemsAddedToCart' }, { name: 'itemsViewed' }],
        dimensions: [{ name: 'itemId' }],
        dateRanges: [{ startDate: '720daysAgo', endDate: 'today' }],
        ...(combinedIdLists.length > 0 && {
          dimensionFilter: {
            filter: {
              fieldName: 'itemId',
              inListFilter: { values: combinedIdLists },
            },
          },
        }),
      })

      const listProductId = response.rows.map((row) => {
        const fullItemId = row.dimensionValues[0].value
        const productId = fullItemId.split('_')[2]
        const itemsAddedToCart = row.metricValues[0].value
        const itemView = row.metricValues[1].value
        return {
          productId,
          cartRate: +itemView > 0 ? +itemsAddedToCart / +itemView : 0,
        }
      })

      return listProductId
    } catch (error) {
      console.error('Error fetching report:', error)
    }
  }
}
