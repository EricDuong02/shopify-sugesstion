import {
  PRODUCT_RECOMMENDER_CREATE,
  PRODUCT_RECOMMENDER_DETAIL,
  PRODUCT_RECOMMENDER_UPDATE,
  RECOMMEND,
} from '@/const'
import { listAttribute, listModule } from '@/data'
import { useApi } from '@/hooks/useApi'
import { GetDataResult, RecommendedProduct, Rule } from '@/types/recommended'
import { useToast } from '@shopify/app-bridge-react'
import {
  DynamicList,
  notEmpty,
  submitSuccess,
  useDynamicList,
  useField,
  useForm,
} from '@shopify/react-form'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const toCreateRule = ({
  column,
  relation,
  value,
}: Rule): Pick<Rule, 'column' | 'relation' | 'value'> => ({
  column,
  relation,
  value,
})

const useRecommend = () => {
  const api = useApi()
  const { slug } = useParams()
  const navigate = useNavigate()
  const { show } = useToast()

  //Fetch data product
  const {
    data: productsPassCondition,
    isLoading,
    refetch: refetchProducts,
  } = useQuery<{
    data: RecommendedProduct[]
  }>(
    ['listData'],
    () => api.get(`v1/recommender-api/recommends-app?id=${slug}`),
    {
      enabled: slug !== 'create',
      refetchOnWindowFocus: false,
    }
  )

  const { data } =
    slug != 'create'
      ? useQuery<{ data: GetDataResult }>(
          ['data-detail'],
          () => {
            return api.get(`${PRODUCT_RECOMMENDER_DETAIL}/?id=${slug}`)
          },
          {
            enabled: true,
            refetchOnWindowFocus: false,
          }
        )
      : { data: undefined }

  const dataDetail = data?.data

  const [dataForm, setDataForm] = useState<GetDataResult>([])

  useEffect(() => {
    if (dataDetail) {
      setDataForm(dataDetail)
    }
  }, [dataDetail])

  const emptyRules = {
    id: '',
    column: listAttribute[0].value,
    relation:
      listAttribute.find((data) => data.value == listAttribute[0].value)
        ?.conditions[0] || '',
    value: [],
  }

  const productRules = useDynamicList<Rule>(
    dataForm[0]?.productGroups[0]?.rules.map((data) => ({
      id: data.id.toString(),
      column: data.column.toString(),
      relation: data.relation.toString(),
      value: data.value,
    })) || [],
    () => {
      return emptyRules
    }
  )
  //product
  const triggerRules = useDynamicList<Rule>(
    dataForm[0]?.triggerProduct?.productGroups[0].rules
      .filter((data) => data.column < 13)
      .map((data) => ({
        id: data.id.toString(),
        column: data.column.toString(),
        relation: data.relation.toString(),
        value: data.value,
      })) || [],

    () => {
      return emptyRules
    }
  )

  //fallback Rules
  const fallbackRules = useDynamicList<Rule>(
    dataForm[0]?.fallBackProduct?.productGroups[0].rules
      .filter((data) => data.column < 13)
      .map((data) => ({
        id: data.id.toString(),
        column: data.column.toString(),
        relation: data.relation.toString(),
        value: data.value,
      })) || [],

    () => {
      return emptyRules
    }
  )
  //fallback auto recommend
  const fallbackAutoRecommend = useDynamicList<Rule>(
    dataForm[0]?.fallBackProduct?.productGroups[0].rules
      .filter((data) => data.column >= 13)
      .map(
        (data: {
          id: number
          column: number
          relation: number
          value: string[]
        }) => ({
          id: data.id.toString(),
          column: data.column.toString(),
          relation: data.relation.toString(),
          value: data.value,
        })
      ) || [],

    () => {
      return {
        id: '',
        column: '13',
        relation:
          listAttribute.find((data) => data.value == listAttribute[0].value)
            ?.conditions[0] || '',
        value: [],
      }
    }
  )

  const autoRecommend = useDynamicList<Rule>(
    dataForm[0]?.triggerProduct?.productGroups[0].rules
      .filter((data) => data.column >= 13)
      .map((data) => ({
        id: data.id.toString(),
        column: data.column.toString(),
        relation: data.relation.toString(),
        value: data.value,
      })) || [],

    () => {
      return {
        id: '',
        column: '13',
        relation:
          listAttribute.find((data) => data.value == listAttribute[0].value)
            ?.conditions[0] || '',
        value: [],
      }
    }
  )
  const fields = {
    id: useField<string>({
      value: dataForm[0]?.id.toString() || '',
      validates: [],
    }),
    name: useField<string>({
      value: dataForm[0] ? dataForm[0].name : listModule[0].label,
      validates: [notEmpty('Name is required')],
    }),

    productGroups: useField({
      id: useField<string>({
        value: dataForm[0]?.productGroups[0]?.id.toString() || '',
        validates: [],
      }),
      typeId: useField<string[]>({
        value: dataForm[0] ? dataForm[0].productGroups[0]?.typeId : [],
        validates: [],
      }),
      ids: useField<string[]>({
        value: dataForm[0] ? dataForm[0].productGroups[0]?.ids : [],
        validates: [],
      }),
    }),
    trigger: useField({
      id: useField<string>({
        value: dataForm[0]?.triggerProduct?.id.toString() || '',
        validates: [],
      }),
      productGroups: useField({
        id: useField<string>({
          value:
            dataForm[0]?.triggerProduct?.productGroups[0].id.toString() || '',
          validates: [],
        }),
        typeId: useField<string[]>({
          value:
            dataForm[0] && dataForm[0].triggerProduct
              ? dataForm[0].triggerProduct?.productGroups[0].typeId
              : [],
          validates: [],
        }),
        ids: useField<string[]>({
          value:
            dataForm[0] && dataForm[0].triggerProduct
              ? dataForm[0].triggerProduct.productGroups[0].ids
              : [],
          validates: [],
        }),
      }),
      scheduleOn: useField<boolean>({
        value:
          dataForm[0] && dataForm[0].triggerProduct
            ? dataForm[0].triggerProduct.scheduleOn
            : true,
        validates: [],
      }),
    }),
    fallback: useField({
      id: useField<string>({
        value: dataForm[0]?.fallBackProduct?.id.toString() || '',
        validates: [],
      }),
      productGroups: useField({
        id: useField<string>({
          value:
            dataForm[0]?.fallBackProduct?.productGroups[0].id.toString() || '',
          validates: [],
        }),
        typeId: useField<string[]>({
          value:
            dataForm[0] && dataForm[0].fallBackProduct
              ? dataForm[0].fallBackProduct?.productGroups[0].typeId
              : [],
          validates: [],
        }),
        ids: useField<string[]>({
          value:
            dataForm[0] && dataForm[0].fallBackProduct
              ? dataForm[0].fallBackProduct.productGroups[0].ids
              : [],
          validates: [],
        }),
      }),
    }),
  }
  const hookForm = useForm<
    typeof fields,
    {
      productRules: DynamicList<Rule>
      triggerRules: DynamicList<Rule>
      autoRecommend: DynamicList<Rule>
      fallbackRules: DynamicList<Rule>
      fallbackAutoRecommend: DynamicList<Rule>
    }
  >({
    fields,
    dynamicLists: {
      productRules,
      triggerRules,
      autoRecommend,
      fallbackRules,
      fallbackAutoRecommend,
    },
    onSubmit: async (fieldValues) => {
      try {
        if (slug === 'create') {
          const data = {
            name: fieldValues.name,
            placeId: 0,
            productGroups: {
              typeId: fieldValues.productGroups.typeId.value,
              rules: fieldValues.productRules.map(toCreateRule),
              ids: fieldValues.productGroups.ids.value,
            },
            trigger: {
              // recommended products
              productGroups: {
                typeId: fieldValues.trigger.productGroups.value.typeId.value,
                rules: [
                  ...fieldValues.triggerRules,
                  ...fieldValues.autoRecommend,
                ].map(toCreateRule),
                ids: fieldValues.trigger.productGroups.value.ids.value,
              },
            },
            fallback: {
              productGroups: {
                typeId: fieldValues.fallback.productGroups.value.typeId.value,
                rules: [
                  ...fieldValues.fallbackRules,
                  ...fieldValues.fallbackAutoRecommend,
                ].map(toCreateRule),
                ids: fieldValues.fallback.productGroups.value.ids.value,
              },
            },
            scheduleOn: fieldValues.trigger.scheduleOn.value,
          }
          await api.post(PRODUCT_RECOMMENDER_CREATE, data)

          refetchProducts()
          show('Success! 🎉', {
            duration: 2000,
            onDismiss: () => {
              navigate(RECOMMEND)
            },
          })
        } else {
          const data = {
            id: fieldValues.id,
            name: fieldValues.name,
            placeId: 0,
            productGroups: {
              id: fieldValues.productGroups.id.value,
              typeId: fieldValues.productGroups.typeId.value,
              rules: fieldValues.productRules,
              ids: fieldValues.productGroups.ids.value,
            },
            trigger: {
              id: fieldValues.trigger.id.value,
              // recommended products
              productGroups: {
                id: fieldValues.trigger.productGroups.value.id.value,
                typeId: fieldValues.trigger.productGroups.value.typeId.value,
                rules: [
                  ...fieldValues.triggerRules,
                  ...fieldValues.autoRecommend,
                ],
                ids: fieldValues.trigger.productGroups.value.ids.value,
              },
            },
            fallback: {
              id: fieldValues.fallback.id.value,
              productGroups: {
                id: fieldValues.fallback.productGroups.value.id.value,
                typeId: fieldValues.fallback.productGroups.value.typeId.value,
                rules: [
                  ...fieldValues.fallbackRules,
                  ...fieldValues.fallbackAutoRecommend,
                ],
                ids: fieldValues.fallback.productGroups.value.ids.value,
              },
            },
            scheduleOn: fieldValues.trigger.scheduleOn.value,
          }
          await api.post(PRODUCT_RECOMMENDER_UPDATE, data)
          refetchProducts()
          show('Success! 🎉', {
            duration: 2000,
            onDismiss: () => console.log('👋 Toast dismissed'),
          })
        }

        return submitSuccess()
      } catch (error) {
        show('Fail! 🎉', {
          duration: 2000,
          onDismiss: () => console.log('👋 Toast dismissed'),
        })
        console.error('Error:', error)
      }

      return { status: 'fail', errors: [{ message: 'bad form data' }] }
    },
  })

  const handleTriggerProduct = (selected: string[]) => {
    hookForm.fields.productGroups.value.typeId.onChange(selected)
  }

  const handleRecommendProduct = (newChecked: boolean, value: string) => {
    if (newChecked) {
      if (value == '1') {
        autoRecommend.addItem()
      }
      hookForm.fields.trigger.value.productGroups.value.typeId.onChange([
        ...hookForm.fields.trigger.value.productGroups.value.typeId.value,
        value,
      ])
    } else {
      if (value == '1') {
        autoRecommend.removeItem(0)
      }
      hookForm.fields.trigger.value.productGroups.value.typeId.onChange(
        hookForm.fields.trigger.value.productGroups.value.typeId.value.filter(
          (product) => product != value
        )
      )
    }
  }

  const handleFallbackRecommendProduct = (
    newChecked: boolean,
    value: string
  ) => {
    if (newChecked) {
      if (value == '1') {
        fallbackAutoRecommend.addItem()
      }
      hookForm.fields.fallback.value.productGroups.value.typeId.onChange([
        ...hookForm.fields.fallback.value.productGroups.value.typeId.value,
        value,
      ])
    } else {
      if (value == '1') {
        fallbackAutoRecommend.removeItem(0)
      }
      hookForm.fields.fallback.value.productGroups.value.typeId.onChange(
        hookForm.fields.fallback.value.productGroups.value.typeId.value.filter(
          (product) => product != value
        )
      )
    }
  }

  return {
    slug,
    hookForm,
    productRules,
    triggerRules,
    autoRecommend,
    productsPassCondition: productsPassCondition,
    isLoadingProduct: isLoading,
    fallbackRules,
    fallbackAutoRecommend,
    handleTriggerProduct,
    handleRecommendProduct,
    handleFallbackRecommendProduct,
  }
}

export default useRecommend
