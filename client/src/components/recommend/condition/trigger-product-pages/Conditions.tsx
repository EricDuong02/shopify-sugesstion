import DatePicking from '@/components/providers/DatePicking'
import { useRecommendContext } from '@/context/pages/RecommendContext'
import { listAttribute, listConditions } from '@/data'
import { Box, Button, Select, TextField } from '@shopify/polaris'
import { DeleteIcon } from '@shopify/polaris-icons'
import Brand from './Brand'
import Category from './Category'

const Conditions = () => {
  const { productRules } = useRecommendContext()

  return (
    <>
      <div style={{ paddingTop: '10px' }}>
        <span style={{ fontWeight: 'bold' }}>
          Products must match ALL CONDITIONS
        </span>
      </div>
      {productRules.fields.map((product, productIndex) => (
        <Box key={productIndex} paddingBlockStart={{ xs: '300' }}>
          <div
            style={{
              display: 'flex',
              flexFlow: 'row wrap',
              paddingBottom: '15px',
            }}
          >
            <div style={{ padding: '5px 0 5px 0', width: '95%' }}>
              <Select
                label=""
                options={listAttribute.filter((item) => {
                  return Number(item.value) < 13
                })}
                onChange={(selected) => {
                  product.column.onChange(selected)
                  const defaultCondition =
                    listAttribute.find((data) => data.value == selected)
                      ?.conditions[0] || ''
                  product.relation.onChange(defaultCondition)
                  product.value.onChange([])
                }}
                value={product.column.value}
              />
            </div>
            {!['13', '14', '15', '16'].includes(product.column.value) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '20px',
                  width: '95%',
                }}
              >
                <div style={{ width: '50%', padding: '10px 0 10px 0' }}>
                  <Select
                    label=""
                    options={listConditions.filter((condition) =>
                      listAttribute
                        .find((data) => data.value === product.column.value)
                        ?.conditions.includes(condition.value)
                    )}
                    onChange={product.relation.onChange}
                    value={product.relation.value}
                  />
                </div>
                <div style={{ width: '50%', padding: '10px 0 10px 0' }}>
                  {['2', '3', '6', '8', '9', '10', '11', '12'].includes(
                    product.column.value
                  ) && (
                    <>
                      <TextField
                        label=""
                        value={product.value.value[0]}
                        onChange={(value) =>
                          product.value.onChange(
                            [value].concat(product.value.value.slice(1))
                          )
                        }
                        autoComplete="off"
                      />
                    </>
                  )}
                  {['1', '7'].includes(product.column.value) && (
                    <DatePicking rule={product} />
                  )}
                  {product.column.value == '4' && (
                    <Category product={product} />
                  )}
                  {product.column.value == '5' && <Brand product={product} />}
                </div>
              </div>
            )}
            <div
              style={{
                display: 'grid',
                placeItems: 'center',
                width: '5%',
              }}
            >
              <Button
                icon={DeleteIcon}
                onClick={() => productRules.removeItem(productIndex)}
              />
            </div>
          </div>
        </Box>
      ))}
      <div style={{ paddingTop: '15px' }}>
        <Button onClick={() => productRules.addItem()}>
          Add another condition
        </Button>
      </div>
    </>
  )
}

export default Conditions
