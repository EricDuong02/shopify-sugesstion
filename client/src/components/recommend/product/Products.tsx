import { useRecommendContext } from '@/context/pages/RecommendContext'
import {
  Avatar,
  Badge,
  Card,
  ChoiceList,
  EmptySearchResult,
  Filters,
  FiltersProps,
  Icon,
  ResourceItem,
  ResourceList,
  Text,
  TextField,
  Tooltip,
} from '@shopify/polaris'
import { InfoIcon } from '@shopify/polaris-icons'
import { useCallback, useState } from 'react'

const Products = () => {
  const [taggedWith, setTaggedWith] = useState<string | undefined>('')
  const [accountStatus, setAccountStatus] = useState<string[]>(['active'])
  const [queryValue, setQueryValue] = useState<string | undefined>('')

  const { listProductPassCondition, isLoadingProduct } = useRecommendContext()

  const items = listProductPassCondition?.data || []

  const handleTaggedWithChange = useCallback(
    (key: string) => (value: string | string[] | number | [number, number]) => {
      switch (key) {
        case 'accountStatus':
          setAccountStatus(value as string[])
          break
        case 'taggedWith1':
          setTaggedWith(value as string)
          break
        default:
          break
      }
    },
    []
  )
  const handleTaggedWithRemove = useCallback((key: string | undefined) => {
    setTaggedWith(undefined)
    switch (key) {
      case 'accountStatus':
        setAccountStatus([])
        break
      case 'taggedWith1':
        setTaggedWith('')
        break
      default:
        setAccountStatus([])
        setTaggedWith('')
        break
    }
  }, [])
  const handleQueryValueRemove = useCallback(() => setQueryValue(''), [])
  const handleClearAll = useCallback(() => {
    handleTaggedWithRemove(undefined)
    handleQueryValueRemove()
  }, [handleQueryValueRemove, handleTaggedWithRemove])

  const resourceName = {
    singular: 'customer',
    plural: 'customers',
  }

  const listStatus = [
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
  ]

  const filters = [
    {
      key: 'taggedWith1',
      label: 'Tagged with',
      filter: (
        <TextField
          label="Tagged with"
          value={taggedWith}
          onChange={handleTaggedWithChange('taggedWith1')}
          autoComplete="off"
          labelHidden
        />
      ),
      shortcut: true,
    },
    {
      key: 'accountStatus',
      label: 'Account status',
      value: accountStatus,
      filter: (
        <ChoiceList
          title="Account status"
          titleHidden
          choices={listStatus}
          selected={accountStatus}
          onChange={handleTaggedWithChange('accountStatus')}
          allowMultiple
        />
      ),
      shortcut: true,
    },
  ]

  const appliedFilters: FiltersProps['appliedFilters'] = []

  filters.forEach(({ key, label }) => {
    if (!isEmpty(label)) {
      if (key === 'taggedWith1' && taggedWith) {
        appliedFilters.push({
          key,
          label: disambiguateLabel('taggedWith1', taggedWith),
          onRemove: () => handleTaggedWithRemove(key),
        })
      }
      if (key === 'accountStatus' && accountStatus) {
        appliedFilters.push({
          key,
          label: disambiguateLabel('accountStatus', accountStatus),
          onRemove: () => handleTaggedWithRemove(key),
        })
      }
    }
  })

  const filterControl = (
    <Filters
      queryValue={queryValue}
      filters={filters}
      appliedFilters={appliedFilters}
      onQueryChange={setQueryValue}
      onQueryClear={handleQueryValueRemove}
      onClearAll={handleClearAll}
    ></Filters>
  )

  // Apply name filter based on queryValue
  const filteredItems = queryValue
    ? items.filter((item) =>
        item.name.toLowerCase().includes(queryValue.toLowerCase())
      )
    : items

  return (
    <Card>
      <div style={{ paddingBottom: '10px', display: 'flex' }}>
        <Text variant="headingMd" as="h5">
          Products
        </Text>
        <Tooltip content="Product list will be updated after submission">
          <Icon source={InfoIcon} />
        </Tooltip>
      </div>
      <ResourceList
        resourceName={resourceName}
        items={filteredItems}
        renderItem={renderItem}
        filterControl={filterControl}
        loading={isLoadingProduct}
        emptySearchState={
          <EmptySearchResult
            title={'No products yet'}
            description={'Try changing the filters or search term'}
            withIllustration
          />
        }
        pagination={{
          hasNext: true,
          onNext: () => {},
        }}
      />
    </Card>
  )

  function renderItem(item: (typeof items)[number]) {
    const { id, url, name, avatarSource, status } = item
    const media = (
      <Avatar customer size="md" name={name} source={avatarSource} />
    )

    return (
      <ResourceItem
        verticalAlignment="center"
        id={id.toString()}
        url={url}
        media={media}
        accessibilityLabel={`View details for ${name}`}
        name={name}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text variant="bodyMd" fontWeight="bold" as="h3">
            {name}
          </Text>
          <Badge tone={status ? 'success' : 'info'}>
            {status ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </ResourceItem>
    )
  }

  function disambiguateLabel(key: string, value: string | string[]): string {
    switch (key) {
      case 'taggedWith1':
        return `Tagged with ${value}`
      case 'accountStatus': {
        const reworkStatus = (value: string | string[]) => {
          const statuses = value as string[]
          if (statuses.length === 1) {
            return statuses[0]
          } else if (statuses.length === 2) {
            return `${statuses[0]} or ${statuses[1]}`
          } else {
            return statuses
              .map((status, index) => {
                return index !== statuses.length - 1 ? status : `or ${status}`
              })
              .join(', ')
          }
        }

        return `Account status: ${reworkStatus(value)}`
      }
      default:
        return ''
    }
  }

  function isEmpty(value: string): boolean {
    if (Array.isArray(value)) {
      return value.length === 0
    } else {
      return value === '' || value == null
    }
  }
}

export default Products
