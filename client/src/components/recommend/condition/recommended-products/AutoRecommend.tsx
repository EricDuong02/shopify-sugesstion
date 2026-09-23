import { listAttribute } from '@/data'
import { Rule } from '@/types/recommended'
import { Select } from '@shopify/polaris'
import { DynamicList } from '@shopify/react-form'
import { useCallback } from 'react'

const autoValue = ({
  autoValue,
}: {
  autoValue: DynamicList<Rule>
}) => {
  // const { autoValue } = useRecommendContext()

  const handleSelectChange = useCallback(
    (value: string) => autoValue.fields[0].column.onChange(value),
    []
  )

  const options = listAttribute.filter((item) => {
    return Number(item.value) >= 13 && Number(item.value) <= 16
  })

  return (
    <div style={{ margin: '10px 0' }}>
      <Select
        label=""
        options={options}
        onChange={handleSelectChange}
        value={autoValue.fields[0]?.column.value}
      />
    </div>
  )
}

export default autoValue
