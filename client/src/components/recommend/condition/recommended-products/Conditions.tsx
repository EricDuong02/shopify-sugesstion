import { listAttribute, listConditions } from '@/data'
import { Rule } from '@/types/recommended'
import { Box, Button, Select, TextField } from '@shopify/polaris'
import { DeleteIcon } from '@shopify/polaris-icons'
import { DynamicList } from '@shopify/react-form'
import Brand from './Brand'
import Category from './Category'
import ListSku from './Sku'

const Conditions = ({ rules }: { rules: DynamicList<Rule> }) => {
  return (
    <>
      <div style={{ paddingTop: '10px' }}>
        <span style={{ fontWeight: 'bold' }}>
          Products must match ALL CONDITIONS
        </span>
      </div>
      {rules.fields.map((triggerRule, triggerRuleIndex) => (
        <Box key={triggerRuleIndex} paddingBlockStart={{ xs: '300' }}>
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
                  triggerRule.column.onChange(selected)
                  const defaultCondition =
                    listAttribute.find((data) => data.value == selected)
                      ?.conditions[0] || ''
                  triggerRule.relation.onChange(defaultCondition)
                  triggerRule.value.onChange([])
                }}
                value={triggerRule.column.value}
              />
            </div>
            {!['13', '14', '15', '16'].includes(triggerRule.column.value) && (
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
                        .find((data) => data.value === triggerRule.column.value)
                        ?.conditions.includes(condition.value)
                    )}
                    onChange={triggerRule.relation.onChange}
                    value={triggerRule.relation.value}
                  />
                </div>

                <div style={{ width: '50%', padding: '10px 0 10px 0' }}>
                  {triggerRule.column.value == '0' && (
                    <ListSku triggerRule={triggerRule} />
                  )}
                  {['2', '3', '6', '8', '9', '10', '11', '12'].includes(
                    triggerRule.column.value
                  ) && (
                    <>
                      <TextField
                        label=""
                        value={triggerRule.value.value[0]}
                        onChange={(value) =>
                          triggerRule.value.onChange(
                            [value].concat(triggerRule.value.value.slice(1))
                          )
                        }
                        autoComplete="off"
                      />
                    </>
                  )}
                  {['1', '7'].includes(triggerRule.column.value) && (
                    // <DatePicking rule={triggerRule} />
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <TextField
                          label=""
                          value={triggerRule.value.value[0]}
                          onChange={(value) =>
                            triggerRule.value.onChange(
                              [value].concat(triggerRule.value.value.slice(1))
                            )
                          }
                          autoComplete="off"
                        />
                      </div>
                      <span
                        style={{
                          marginLeft: '10px',
                          flexShrink: 0,
                          paddingRight: '5px',
                        }}
                      >
                        day(s) ago
                      </span>
                      {/* Add spacing as needed */}
                    </div>
                  )}
                  {triggerRule.column.value == '4' && (
                    <Category triggerRule={triggerRule} />
                  )}
                  {triggerRule.column.value == '5' && (
                    <Brand triggerRule={triggerRule} />
                  )}
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
                onClick={() => rules.removeItem(triggerRuleIndex)}
              />
            </div>
          </div>
        </Box>
      ))}
      <div style={{ paddingTop: '15px' }}>
        <Button onClick={() => rules.addItem()}>Add another condition</Button>
      </div>
    </>
  )
}

export default Conditions
