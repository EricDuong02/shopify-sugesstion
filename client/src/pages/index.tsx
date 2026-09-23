import { Card, Layout, Page } from '@shopify/polaris'

import { useApi } from '@/hooks/useApi'
import { useQuery } from '@tanstack/react-query'
import { useApiNotTokenShopify } from '@/hooks/useApiNotTokenShopify'

export default function HomePage() {
  const api = useApi()
  const api1 = useApiNotTokenShopify()
  const { data: dataGQL } = useQuery(['productsGQ111L'], () => {
    return api.get(`/products/gql`)
  })
  const { data: dataGQaL } = useQuery(
    ['productsGQ1111111323111L'],
    () => {
      return api1.get(`/v1/recommender-api/recommends?id=34`)
    },
    {
      enabled: true,
      refetchOnWindowFocus: true,
    }
  )
  console.log('11111', dataGQaL?.data)
  const products = dataGQL?.data || []

  return (
    <Page narrowWidth>
      <Layout>
        <Layout.Section>
          <Card>
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-pink-300 to-red-600 mb-5">
              Products
            </h1>

            {products && (
              <ol>
                {products.map((product: any, index: number) => (
                  <li key={index}>{product.node.title}</li>
                ))}
              </ol>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  )
}
