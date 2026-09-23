import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/hooks/useApi'
import { TypeDataCategory } from '@/types/recommended'
import { PRODUCT_RECOMMENDER_CATEGORY } from '@/const'

const useCategory = () => {
  const api = useApi()
  const { data } = useQuery(
    ['category'],
    () => {
      return api.get(PRODUCT_RECOMMENDER_CATEGORY)
    },
    {
      enabled: true,
      refetchOnWindowFocus: false,
    }
  )

  const dataCategory: TypeDataCategory = data?.data

  return { dataCategory }
}

export default useCategory
