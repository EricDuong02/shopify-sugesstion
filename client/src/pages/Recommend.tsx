import { RECOMMEND_CREATE } from '@/const'
import useDashboard from '@/hooks/recommend/useDashboard'

import {
  Card,
  IndexTable,
  Link,
  Page,
  Text,
  Tooltip,
  useBreakpoints,
  useIndexResourceState,
} from '@shopify/polaris'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const Recommend = () => {
  const navigate = useNavigate()
  const { data: dataFetch, isLoading } = useDashboard()
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false // Set to false after first render
    }
  })

  const offerData = dataFetch?.data || []

  const resourceName = {
    singular: 'recommendation',
    plural: 'recommendations',
  }
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(offerData)

  const rowMarkup = offerData.map(
    ({ id, name, trigger, condition, products }, index) => {
      const listTitleProduct = products
        ? products.map((data) => data.name)
        : []

      return (
        <IndexTable.Row
          id={id.toString()}
          key={id}
          selected={selectedResources.includes(id.toString())}
          position={index}
        >
          <IndexTable.Cell>
            <Link
              dataPrimaryLink
              url={`/recommend/${id}`}
              onClick={() => {
                return navigate(`/recommend/${id}`)
              }}
            >
              <Text fontWeight="bold" as="span">
                {name}
              </Text>
            </Link>
          </IndexTable.Cell>
          <IndexTable.Cell>{trigger}</IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span">{condition}</Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {listTitleProduct?.length && listTitleProduct?.length > 0 ? (
              <Tooltip
                active={
                  isFirstRender ? undefined : listTitleProduct?.length > 5
                }
                content={listTitleProduct?.join(', ')}
              >
                <Text fontWeight="bold" as="span">
                  {listTitleProduct?.length > 5
                    ? listTitleProduct?.slice(0, 5).join(', ') + '...'
                    : listTitleProduct?.join(', ')}
                </Text>
              </Tooltip>
            ) : (
              <Text fontWeight="bold" as="span">
                There are no products that satisfy the conditions
              </Text>
            )}
          </IndexTable.Cell>
        </IndexTable.Row>
      )
    }
  )

  return (
    <Page
      fullWidth
      title="Recommendation section"
      primaryAction={{
        content: 'Add Recommendation',
        onAction: () => {
          navigate(RECOMMEND_CREATE)
        },
      }}
    >
      <Card>
        <IndexTable
          condensed={useBreakpoints().smDown}
          resourceName={resourceName}
          itemCount={offerData.length}
          loading={isLoading}
          selectedItemsCount={
            allResourcesSelected ? 'All' : selectedResources.length
          }
          onSelectionChange={handleSelectionChange}
          headings={[
            {
              title: 'Recommendation name',
              alignment: 'start',
              id: 'recommendation-name',
            },
            { title: 'Trigger', alignment: 'start', id: 'trigger' },
            {
              alignment: 'start',
              id: 'condition',
              title: 'Condition',
            },
            {
              alignment: 'start',
              id: 'productId',
              title: 'Product',
            },
          ]}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
    </Page>
  )
}
export default Recommend
