import useBrand from '@/hooks/recommend/useBrand'
import { Rule } from '@/types/recommended'
import { Autocomplete, InlineStack, Tag } from '@shopify/polaris'
import { FieldDictionary } from '@shopify/react-form'
import { useCallback, useEffect, useState } from 'react'

const Brand = ({ triggerRule }: { triggerRule: FieldDictionary<Rule> }) => {
  const { data: brandVendor } = useBrand()

  const selectedOptions = triggerRule.value.value || []

  const [inputValue, setInputValue] = useState('')
  const [options, setOptions] = useState<Array<typeof brandVendor>>([])

  useEffect(() => {
    if (brandVendor) {
      setOptions(brandVendor)
    }
  }, [brandVendor])

  const updateText = useCallback(
    (value: string) => {
      setInputValue(value)

      if (value === '') {
        setOptions(brandVendor)
        return
      }

      const filterRegex = new RegExp(value, 'i')
      const resultOptions = brandVendor.filter((option: { label: string }) =>
        option.label.match(filterRegex)
      )

      setOptions(resultOptions)
    },
    [brandVendor]
  )

  const removeTag = useCallback(
    (tag: string) => () => {
      const options = [...selectedOptions]
      options.splice(options.indexOf(tag), 1)
      triggerRule.value.onChange(options)
    },
    [selectedOptions, triggerRule.value]
  )

  const verticalContentMarkup =
    selectedOptions.length > 0 ? (
      <InlineStack align="start" gap="100">
        {selectedOptions.map((option) => {
          let tagLabel = ''
          tagLabel = option.replace('_', ' ')
          tagLabel = titleCase(tagLabel)
          return (
            <Tag key={`option${option}`} onRemove={removeTag(option)}>
              {tagLabel}
            </Tag>
          )
        })}
      </InlineStack>
    ) : null

  const textField = (
    <Autocomplete.TextField
      onChange={updateText}
      label=""
      value={inputValue}
      placeholder="Type here to search"
      verticalContent={verticalContentMarkup}
      autoComplete="off"
    />
  )

  return (
    <div>
      <Autocomplete
        allowMultiple
        options={options}
        selected={selectedOptions}
        textField={textField}
        onSelect={triggerRule.value.onChange}
        listTitle="Suggested Tags"
      />
    </div>
  )

  function titleCase(string: string) {
    return string
      .toLowerCase()
      .split(' ')
      .map((word) => word.replace(word[0], word[0].toUpperCase()))
      .join('')
  }
}

export default Brand
