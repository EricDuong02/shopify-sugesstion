import { useRecommendContext } from '@/context/pages/RecommendContext'
import { typeRecommended } from '@/data'
import { Card, Checkbox, Icon, Text, Tooltip } from '@shopify/polaris'
import AutoRecommend from './condition/recommended-products/AutoRecommend'
import Conditions from './condition/recommended-products/Conditions'
import { InfoIcon } from '@shopify/polaris-icons'

const FallBackRecommend = () => {
  const {
    hookForm: {
      fields: { fallback },
    },
    fallbackRules,
    fallbackAutoRecommend,
    handleFallbackRecommendProduct,
  } = useRecommendContext()

  return (
    <Card>
      <div style={{ paddingBottom: '10px', display: 'flex' }}>
        <Text variant="headingMd" as="h5">
          Fallback Recommended products
        </Text>
        <Tooltip content="If there are fewer than 10 products satisfying the condition/s set in Recommended products, the Fallback Recommended products will be applied.">
          <Icon source={InfoIcon} />
        </Tooltip>
      </div>
      <div style={{ display: 'flex', flexFlow: 'column' }}>
        <Checkbox
          label={typeRecommended.find((data) => data.value == '1')?.label}
          checked={fallback.value.productGroups.value.typeId.value?.includes(
            '1'
          )}
          onChange={(newChecked) =>
            handleFallbackRecommendProduct(newChecked, '1')
          }
        />
        {fallback.value.productGroups.value.typeId.value?.includes('1') && (
          <AutoRecommend autoValue={fallbackAutoRecommend} />
        )}
        <Checkbox
          label={typeRecommended.find((data) => data.value == '3')?.label}
          checked={fallback.value.productGroups.value.typeId.value?.includes(
            '3'
          )}
          onChange={(newChecked) =>
            handleFallbackRecommendProduct(newChecked, '3')
          }
        />
        {fallback.value.productGroups.value.typeId.value?.includes('3') && (
          <Conditions rules={fallbackRules} />
        )}
      </div>
    </Card>
  )
}

export default FallBackRecommend
