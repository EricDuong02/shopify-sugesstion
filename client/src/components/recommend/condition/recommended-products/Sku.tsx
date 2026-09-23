import { Rule } from '@/types/recommended'
import { LegacyStack, Tag, TextField } from '@shopify/polaris'
import { FieldDictionary } from '@shopify/react-form'
import { useState, useCallback, useEffect, SetStateAction } from 'react'

function ListSku({ triggerRule }: { triggerRule: FieldDictionary<Rule> }) {
  const [tags, setTags] = useState(triggerRule.value.value)
  const [textFieldValue, setTextFieldValue] = useState('')

  useEffect(() => {
    triggerRule.value.onChange(tags)
  }, [tags])

  const handleTextFieldChange = useCallback((value: SetStateAction<string>) => {
    setTextFieldValue(value)
  }, [])

  const addTags = useCallback(
    (input: string) => {
      const newTags = input
        .split(/[\s,]+/) // Split by space or comma
        .map((tag: string) => tag.trim()) // Remove extra spaces
        .filter((tag: string) => tag && !tags.includes(tag)) // Filter out empty or duplicate tags

      if (newTags.length > 0) {
        setTags((prevTags) => [...prevTags, ...newTags])
      }
    },
    [tags]
  )

  const handleKeyDown = useCallback(
    (event: { key: string; preventDefault: () => void }) => {
      if (event.key === ' ' || event.key === ',') {
        event.preventDefault()
        addTags(textFieldValue)
        setTextFieldValue('')
      }
    },
    [textFieldValue, addTags]
  )

  const handlePaste = useCallback(
    (event: {
      preventDefault: () => void
      clipboardData: { getData: (arg0: string) => any }
    }) => {
      event.preventDefault()
      const pasteText = event.clipboardData.getData('Text')
      addTags(pasteText)
    },
    [addTags]
  )

  const removeTag = useCallback((tag: string) => {
    setTags((prevTags) => prevTags.filter((t) => t !== tag))
  }, [])

  const verticalContentMarkup =
    tags.length > 0 ? (
      <LegacyStack spacing="extraTight" alignment="center">
        {tags.map((tag) => (
          <Tag key={tag} onRemove={() => removeTag(tag)}>
            {tag}
          </Tag>
        ))}
      </LegacyStack>
    ) : null

  return (
    <div onKeyDown={handleKeyDown} onPaste={handlePaste}>
      <TextField
        label=""
        value={textFieldValue}
        onChange={handleTextFieldChange}
        placeholder="Paste list SKU in here or type with ,"
        autoComplete="off"
        verticalContent={verticalContentMarkup}
      />
    </div>
  )
}

export default ListSku
