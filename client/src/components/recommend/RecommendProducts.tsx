import { useRecommendContext } from '@/context/pages/RecommendContext'
import { typeRecommended } from '@/data'
import { Card, Checkbox, Text } from '@shopify/polaris'
import AutoRecommend from './condition/recommended-products/AutoRecommend'
import Conditions from './condition/recommended-products/Conditions'

const RecommendProducts = () => {
  const {
    hookForm: {
      fields: { trigger },
    },
    autoRecommend,
    triggerRules,
    handleRecommendProduct,
  } = useRecommendContext()

  return (
    <Card>
      <div style={{ paddingBottom: '10px' }}>
        <Text variant="headingMd" as="h5">
          Recommended products
        </Text>
      </div>
      <div style={{ display: 'flex', flexFlow: 'column' }}>
        <Checkbox
          label={typeRecommended.find((data) => data.value == '1')?.label}
          checked={trigger.value.productGroups.value.typeId.value?.includes(
            '1'
          )}
          onChange={(newChecked) => handleRecommendProduct(newChecked, '1')}
        />
        {trigger.value.productGroups.value.typeId.value?.includes('1') && (
          <AutoRecommend autoValue={autoRecommend} />
        )}
        <Checkbox
          label={typeRecommended.find((data) => data.value == '3')?.label}
          checked={trigger.value.productGroups.value.typeId.value?.includes(
            '3'
          )}
          onChange={(newChecked) => handleRecommendProduct(newChecked, '3')}
        />
        {trigger.value.productGroups.value.typeId.value?.includes('3') && (
          <Conditions rules={triggerRules} />
        )}
      </div>
    </Card>
  )
}

export default RecommendProducts
