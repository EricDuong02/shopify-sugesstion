import { PRODUCT_RECOMMENDER_DATA } from '@/const'
import { useApi } from '@/hooks/useApi'
import { RecommendedProduct } from '@/types/recommended'
import { useQuery } from '@tanstack/react-query'

const useDashboard = () => {
  const api = useApi()

  const { data, isLoading } = useQuery<{
    data: {
      id: number
      name: string
      trigger: string
      condition: string
      active: boolean
      products: RecommendedProduct[]
    }[]
  }>(
    ['data-table'],
    () => {
      return api.get(PRODUCT_RECOMMENDER_DATA)
    },
    {
      enabled: true,
      refetchOnWindowFocus: false,
    }
  )

  return {
    data,
    isLoading,
  }
}

export default useDashboard
