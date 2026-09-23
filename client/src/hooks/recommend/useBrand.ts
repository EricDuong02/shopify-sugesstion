import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/hooks/useApi'
import { PRODUCT_RECOMMENDER_BRAND_VENDOR } from '@/const'

const useBrand = () => {
  const api = useApi()
  const { data: brandVendor } = useQuery(
    ['brand-vendor'],
    () => {
      return api.get(PRODUCT_RECOMMENDER_BRAND_VENDOR)
    },
    {
      enabled: true,
      refetchOnWindowFocus: false,
    }
  )

  const data = brandVendor?.data

  return {
    data,
  }
}

export default useBrand
