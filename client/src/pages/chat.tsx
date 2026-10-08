import { useCallback, useEffect, useState } from 'react'
import {
  Banner,
  BlockStack,
  Card,
  IndexTable,
  InlineGrid,
  Page,
  Spinner,
  Text,
} from '@shopify/polaris'
import { useApi } from '../hooks/useApi'

interface DayCount {
  day: string
  count: number
}

interface ChatStats {
  shop: string
  sessions: { total: number; today: number }
  messages: { total: number; today: number; perDay: DayCount[] }
  fallback: { count: number; rate: number }
  tokens: { in: number; out: number }
  latencyMsAvg: number | null
  embeddings: number
  spendTodayUsd: number
}

function formatInt(n: number): string {
  return Number(n || 0).toLocaleString('en-US')
}

function formatPct(rate: number): string {
  return (Number(rate || 0) * 100).toFixed(1) + '%'
}

function StatCard(props: { title: string; value: string; subtitle?: string }) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">
          {props.title}
        </Text>
        <Text as="p" variant="headingLg">
          {props.value}
        </Text>
        {props.subtitle ? (
          <Text as="p" tone="subdued">
            {props.subtitle}
          </Text>
        ) : null}
      </BlockStack>
    </Card>
  )
}

export default function ChatMonitoringPage() {
  const api = useApi()
  const [stats, setStats] = useState<ChatStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/v1/chat-admin/stats')
      setStats(response.data)
    } catch (err) {
      setError('Could not load chat statistics. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const perDay = stats?.messages.perDay ?? []

  return (
    <Page
      title="Chat monitoring"
      primaryAction={{ content: 'Refresh', onAction: loadStats }}
    >
      {loading && !stats ? (
        <BlockStack>
          <InlineGrid columns={3}>
            <Spinner />
          </InlineGrid>
        </BlockStack>
      ) : null}

      {error ? (
        <Banner tone="critical" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      ) : null}

      {stats ? (
        <BlockStack gap="400">
          <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 3 }} gap="400">
            <StatCard
              title="Sessions today"
              value={formatInt(stats.sessions.today)}
              subtitle={`${formatInt(stats.sessions.total)} total`}
            />
            <StatCard
              title="Messages today"
              value={formatInt(stats.messages.today)}
              subtitle={`${formatInt(stats.messages.total)} total`}
            />
            <StatCard
              title="Fallback rate"
              value={formatPct(stats.fallback.rate)}
              subtitle={`${formatInt(stats.fallback.count)} fallbacks`}
            />
            <StatCard
              title="Average latency"
              value={
                stats.latencyMsAvg != null
                  ? `${Math.round(stats.latencyMsAvg)} ms`
                  : 'n/a'
              }
            />
            <StatCard
              title="Tokens in / out"
              value={`${formatInt(stats.tokens.in)} / ${formatInt(stats.tokens.out)}`}
            />
            <StatCard
              title="Paid spend today"
              value={`$${Number(stats.spendTodayUsd || 0).toFixed(4)}`}
            />
            <StatCard
              title="Indexed products"
              value={formatInt(stats.embeddings)}
              subtitle={`shop ${stats.shop}`}
            />
          </InlineGrid>

          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Messages per day (last 7 days)
              </Text>
              {perDay.length === 0 ? (
                <Text as="p" tone="subdued">
                  No messages yet.
                </Text>
              ) : (
                <IndexTable
                  resourceName={{ singular: 'day', plural: 'days' }}
                  itemCount={perDay.length}
                  headings={[
                    { title: 'Day' },
                    { title: 'Messages', alignment: 'end' },
                  ]}
                  selectable={false}
                >
                  {perDay.map((row, index) => (
                    <IndexTable.Row id={row.day} key={row.day} position={index}>
                      <IndexTable.Cell>{row.day}</IndexTable.Cell>
                      <IndexTable.Cell>{formatInt(row.count)}</IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </BlockStack>
      ) : null}
    </Page>
  )
}
