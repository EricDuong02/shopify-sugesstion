import { useRecommendContext } from '@/context/pages/RecommendContext'
import { Card, ChoiceList, Text } from '@shopify/polaris'
import React from 'react'
import Conditions from './condition/trigger-product-pages/Conditions'
import Product from './condition/trigger-product-pages/Product'
import { typeProduct } from '@/data'

const TriggerProducts = () => {
  const {
    hookForm: {
      fields: { productGroups },
    },
    handleTriggerProduct,
  } = useRecommendContext()
  return (
    <Card>
      <Text variant="headingMd" as="h5">
        Trigger products
      </Text>
      <ChoiceList
        title=" "
        choices={typeProduct}
        selected={productGroups.value.typeId.value}
        onChange={handleTriggerProduct}
      />
      {productGroups.value.typeId.value[0] === '3' && <Conditions />}
      {productGroups.value.typeId.value[0] === '2' && <Product />}
    </Card>
  )
}

export default TriggerProducts
