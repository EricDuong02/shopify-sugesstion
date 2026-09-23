import { useRecommendContext } from '@/context/pages/RecommendContext'
import { listModule } from '@/data'
import { Autocomplete, Card, Text } from '@shopify/polaris'
import { useCallback, useMemo, useState } from 'react'

const Name = () => {
  const {
    hookForm: {
      fields: { name },
    },
  } = useRecommendContext()

  const deselectedOptions = useMemo(() => listModule, [])
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [options, setOptions] = useState(deselectedOptions)

  const updateText = useCallback(
    (value: string) => {
      name.onChange(value)

      if (value === '') {
        setOptions(deselectedOptions)
        return
      }

      const filterRegex = new RegExp(value, 'i')
      const resultOptions = deselectedOptions.filter((option) =>
        option.label.match(filterRegex)
      )
      setOptions(resultOptions)
    },
    [deselectedOptions]
  )

  const updateSelection = useCallback(
    (selected: string[]) => {
      const selectedValue = selected.map((selectedItem) => {
        const matchedOption = options.find((option) => {
          return option.value.match(selectedItem)
        })
        return matchedOption && matchedOption.label
      })

      setSelectedOptions(selected)
      name.onChange(selectedValue[0] || '')
    },
    [options]
  )

  const textField = (
    <Autocomplete.TextField
      onChange={updateText}
      label=""
      value={name.value}
      placeholder="For example, Related products"
      autoComplete="off"
    />
  )

  return (
    <Card>
      <div style={{ paddingBottom: '10px' }}>
        <Text variant="headingMd" as="h6">
          Recommendation name
        </Text>
      </div>
      <Autocomplete
        options={options}
        selected={selectedOptions}
        onSelect={updateSelection}
        textField={textField}
      />
    </Card>
  )
}

export default Name
