import { convertToDate } from '@/functions/convertToDate'
import { Rule } from '@/types/recommended'
import {
  BlockStack,
  Box,
  Card,
  DatePicker,
  Icon,
  Popover,
  PopoverCloseSource,
  Range,
  TextField,
} from '@shopify/polaris'
import { CalendarIcon } from '@shopify/polaris-icons'
import { FieldDictionary } from '@shopify/react-form'
import { useEffect, useState } from 'react'

const DatePicking = ({
  rule,
}: {
  rule: FieldDictionary<Rule>
}) => {
  const value = convertToDate(rule.value.value[0])

  const [visible, setVisible] = useState(false)
  const [selectedDate, setSelectedDate] = useState(value || new Date())
  const [{ month, year }, setDate] = useState({
    month: selectedDate.getMonth(),
    year: selectedDate.getFullYear(),
  })
  const formattedValue = selectedDate.toISOString().slice(0, 10)
  function handleInputValueChange() {
    console.log('handleInputValueChange')
  }

  function handleOnClose(source: PopoverCloseSource) {
    console.log(source)
    setVisible(false)
  }
  function handleMonthChange(month: number, year: number) {
    setDate({ month, year })
  }

  function handleDateSelection(date: Range) {
    const now = new Date()
    const initialDate = date.end
    initialDate.setHours(now.getHours())
    initialDate.setMinutes(now.getMinutes())
    initialDate.setSeconds(now.getSeconds())
    rule.value.onChange([initialDate.toISOString()])
    setSelectedDate(initialDate)

    setVisible(false)
  }
  useEffect(() => {
    if (selectedDate) {
      setDate({
        month: selectedDate.getMonth(),
        year: selectedDate.getFullYear(),
      })
    }
  }, [selectedDate])

  useEffect(() => {
    if (!rule.value.value[0]) {
      rule.value.onChange([new Date().toISOString()])
    }
  }, [rule.value.value[0]])

  return (
    <BlockStack gap="400">
      <Box>
        <Popover
          active={visible}
          autofocusTarget="none"
          preferredAlignment="left"
          fullWidth
          preferInputActivator={false}
          preferredPosition="below"
          preventCloseOnChildOverlayClick
          onClose={handleOnClose}
          activator={
            <TextField
              role="combobox"
              label={''}
              prefix={<Icon source={CalendarIcon} />}
              value={formattedValue}
              onFocus={() => setVisible(true)}
              onChange={handleInputValueChange}
              autoComplete="off"
            />
          }
        >
          <Card>
            <DatePicker
              month={month}
              year={year}
              selected={selectedDate}
              onMonthChange={handleMonthChange}
              onChange={handleDateSelection}
            />
          </Card>
        </Popover>
      </Box>
    </BlockStack>
  )
}

export default DatePicking
