import { useRecommendContext } from '@/context/pages/RecommendContext'
import { pageOptions } from '@/data'
import { Card, ChoiceList, Text } from '@shopify/polaris'

const TriggerPages = () => {
  const {
    hookForm: {
      fields: { trigger },
    },
    handleChoiceListChange,
  } = useRecommendContext()

  return (
    <Card>
      <Text variant="headingMd" as="h5">
        Trigger pages
      </Text>
      <ChoiceList
        allowMultiple
        title
        choices={pageOptions}
        selected={trigger.value.pageIds.value}
        onChange={handleChoiceListChange}
      />
    </Card>
  )
}

export default TriggerPages
