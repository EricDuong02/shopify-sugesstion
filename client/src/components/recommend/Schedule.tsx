import { useRecommendContext } from '@/context/pages/RecommendContext'
import { Button, Card, Text } from '@shopify/polaris'
import { ToggleOffIcon, ToggleOnIcon } from '@shopify/polaris-icons'

const Schedule = () => {
  const {
    hookForm: {
      fields: { trigger },
    },
  } = useRecommendContext()
  const handleToggle = () => {
    trigger.value.scheduleOn.onChange(!trigger.value.scheduleOn.value)
  }

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <Text variant="headingMd" as="h5">
          Schedule (optional)
        </Text>
        <div
          style={{
            transform: 'scale(1.5)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Button
            icon={trigger.value.scheduleOn.value ? ToggleOnIcon : ToggleOffIcon}
            size="large"
            tone="success"
            accessibilityLabel="action"
            variant="monochromePlain"
            onClick={() => handleToggle()}
          />
        </div>
      </div>
      <Text as={'h5'}>* This option is to set your offer for future uses</Text>
    </Card>
  )
}

export default Schedule
