import { useRecommendContext } from '@/context/pages/RecommendContext'
import useProduct from '@/hooks/recommend/useProduct'
import { Autocomplete, InlineStack, Tag } from '@shopify/polaris'
import { debounce } from 'lodash'
import { useCallback, useState } from 'react'
const Product = () => {
  const {
    hookForm: {
      fields: { trigger },
    },
  } = useRecommendContext()

  const { setDataSearch, options, isFetching } = useProduct()

  const [listChosen, setListChosen] = useState<
    {
      value: string
      label: string
    }[]
  >([])

  const selectedOptions = trigger.value.productGroups.value.ids.value
  const [inputValue, setInputValue] = useState('')

  const debouncedSetDataSearch = useCallback(
    debounce((value: string) => {
      setDataSearch(value)
    }, 1000),
    []
  )

  const updateText = useCallback(
    (value: string) => {
      setInputValue(value)
      debouncedSetDataSearch(value)
    },
    [debouncedSetDataSearch]
  )

  const removeTag = useCallback(
    (tag: string) => () => {
      const options = [...selectedOptions]
      options.splice(options.indexOf(tag), 1)
      trigger.value.productGroups.value.ids.onChange(options)
    },
    [selectedOptions]
  )

  const verticalContentMarkup =
    selectedOptions.length > 0 ? (
      <InlineStack align="start" gap="100">
        {selectedOptions.map((option: string) => {
          const label = listChosen.find((data) => data.value == option)?.label

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
      <div style={{ padding: '10px 0 10px' }}>
        <span style={{ fontWeight: 'bold' }}>Select PRODUCTS</span>
      </div>
      <Autocomplete
        allowMultiple
        options={options}
        selected={selectedOptions}
        textField={textField}
        loading={isFetching}
        onSelect={(selected: string[]) => {
          const filteredOptions = options.filter((option) =>
            selected.includes(option.value)
          )
          setListChosen((listChosen) => [...listChosen, ...filteredOptions])
          trigger.value.productGroups.value.ids.onChange(selected)
        }}
        listTitle="Suggested Tags"
      />
    </div>
  )
}

export default Product
