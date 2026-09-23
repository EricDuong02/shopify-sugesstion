import { extractProductId } from '@/functions/extractProductId'
import useCategory from '@/hooks/recommend/useCategory'
import { Rule, TypeDataCategory } from '@/types/recommended'
import { Autocomplete, InlineStack, Tag } from '@shopify/polaris'
import { FieldDictionary } from '@shopify/react-form'
import { useCallback, useEffect, useState, useMemo } from 'react'

const reDefineCategory = (data: TypeDataCategory) => {
  return data.map((data) => ({
    value: extractProductId(data.id),
    label: data.title,
  }))
}

const Category = ({ triggerRule }: { triggerRule: FieldDictionary<Rule> }) => {
  const { dataCategory } = useCategory()

  const deselectedOptions = useMemo(() => {
    return dataCategory ? reDefineCategory(dataCategory) : []
  }, [dataCategory])

  const selectedOptions = triggerRule.value.value

  const [inputValue, setInputValue] = useState('')
  const [options, setOptions] = useState(deselectedOptions)

  // Only update options when deselectedOptions change
  useEffect(() => {
    setOptions(deselectedOptions)
  }, [deselectedOptions])

  const updateText = useCallback(
    (value: string) => {
      setInputValue(value)

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
          const label = options.find((data) => data.value == option)?.label

          return (
            <Tag key={`option${option}`} onRemove={removeTag(option)}>
              {label}
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
}

export default Category
