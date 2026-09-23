import { PRODUCT_RECOMMENDER_ALL } from '@/const'
import { extractProductId } from '@/functions/extractProductId'
import { useApi } from '@/hooks/useApi'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

const useProduct = () => {
  const api = useApi()
  const [afterCursor, setAfterCursor] = useState<string>('')
  const [dataSearch, setDataSearch] = useState<string>('')
  const [options, setOptions] = useState<
    {
      value: string
      label: string
    }[]
  >([])
  const { data: dataProduct, isFetching } = useQuery(
    ['product-recommender', dataSearch, afterCursor],
    () => {
      return api.get(
        `${PRODUCT_RECOMMENDER_ALL}/?search=${dataSearch}&afterCursor=${afterCursor}`
      )
    },
    {
      enabled: true,
      refetchOnWindowFocus: false,
      keepPreviousData: true,
    }
  )

  const transformationData = (
    data: any
  ): {
    value: string
    label: string
  }[] => {
    return data.data.products.edges.map(
      (data: { node: { id: string; title: any } }) => {
        return {
          value: extractProductId(data.node.id),
          label: data.node.title,
        }
      }
    )
  }
  useEffect(() => {
    if (dataProduct) {
      setOptions(transformationData(dataProduct))
    }
  }, [dataProduct])
  return {
    options,
    setOptions,
    setAfterCursor,
    setDataSearch,
    isFetching,
  }
}

export default useProduct
