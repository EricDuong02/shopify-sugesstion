import { useCallback, useEffect, useState } from 'react'
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Page,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris'
import { useApi } from '../hooks/useApi'

interface TestResult {
  ok: boolean
  error?: string
  latencyMs?: number
  text?: string
}

interface ChatConfig {
  shopId: string
  enabled: boolean
  llmProvider: string
  llmModel: string
  systemPrompt: string | null
  topK: number
  temperature: number
  publicToken: string
  rateLimitPerMin: number
  fallbackMode: string
  fallbackBudgetCapUsdPerDay: number
  hasCustomApiKey: boolean
}

const PROVIDER_OPTIONS = [
  { label: 'OpenAI (paid)', value: 'openai' },
  { label: 'Gemini (free tier)', value: 'gemini' },
  { label: 'Groq (free tier)', value: 'groq' },
  { label: 'Ollama (self-hosted, free)', value: 'ollama' },
]

const FALLBACK_MODE_OPTIONS = [
  {
    label: 'Free providers only (no cost, may show a busy message)',
    value: 'free_only',
  },
  {
    label: 'Free first, paid as backup (recommended)',
    value: 'free_first_paid_backup',
  },
  { label: 'Paid primary (most reliable)', value: 'paid_primary' },
]

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-3.8-flash',
  groq: 'qwen/qwen3.8-27b',
  ollama: 'qwen2.5',
}

export default function ChatConfigPage() {
  const api = useApi()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [banner, setBanner] = useState<{
    tone: 'success' | 'critical'
    message: string
  } | null>(null)

  const [enabled, setEnabled] = useState(true)
  const [llmProvider, setLlmProvider] = useState('openai')
  const [llmModel, setLlmModel] = useState('gpt-4o-mini')
  const [apiKey, setApiKey] = useState('')
  const [hasCustomApiKey, setHasCustomApiKey] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [topK, setTopK] = useState('5')
  const [temperature, setTemperature] = useState('0.3')
  const [rateLimitPerMin, setRateLimitPerMin] = useState('20')
  const [fallbackMode, setFallbackMode] = useState('free_first_paid_backup')
  const [budgetCap, setBudgetCap] = useState('2')

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get('/v1/chat-admin/config')
      const cfg: ChatConfig = response.data
      setEnabled(cfg.enabled)
      setLlmProvider(cfg.llmProvider)
      setLlmModel(cfg.llmModel)
      setHasCustomApiKey(cfg.hasCustomApiKey)
      setSystemPrompt(cfg.systemPrompt ?? '')
      setTopK(String(cfg.topK))
      setTemperature(String(cfg.temperature))
      setRateLimitPerMin(String(cfg.rateLimitPerMin))
      setFallbackMode(cfg.fallbackMode)
      setBudgetCap(String(cfg.fallbackBudgetCapUsdPerDay))
      setApiKey('')
    } catch (err) {
      setBanner({
        tone: 'critical',
        message: 'Could not load chat configuration.',
      })
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const handleProviderChange = (value: string) => {
    setLlmProvider(value)
    if (DEFAULT_MODELS[value]) setLlmModel(DEFAULT_MODELS[value])
  }

  const handleSave = async () => {
    setSaving(true)
    setBanner(null)
    try {
      const payload: Record<string, unknown> = {
        enabled,
        llmProvider,
        llmModel,
        systemPrompt: systemPrompt || null,
        topK: parseInt(topK, 10) || 5,
        temperature: parseFloat(temperature) || 0,
        rateLimitPerMin: parseInt(rateLimitPerMin, 10) || 20,
        fallbackMode,
        fallbackBudgetCapUsdPerDay: parseFloat(budgetCap) || 0,
      }
      if (apiKey.trim()) payload.llmApiKey = apiKey.trim()

      const response = await api.put('/v1/chat-admin/config', payload)
      const cfg: ChatConfig = response.data
      setHasCustomApiKey(cfg.hasCustomApiKey)
      setApiKey('')
      setBanner({ tone: 'success', message: 'Configuration saved.' })
    } catch (err) {
      setBanner({
        tone: 'critical',
        message: 'Could not save configuration. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleClearKey = async () => {
    try {
      await api.delete('/v1/chat-admin/config/api-key')
      setHasCustomApiKey(false)
      setBanner({
        tone: 'success',
        message: 'Custom API key removed. Platform keys will be used.',
      })
    } catch (err) {
      setBanner({ tone: 'critical', message: 'Could not remove the API key.' })
    }
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const response = await api.post('/v1/chat-admin/test-provider', {
        llmProvider,
        llmModel,
      })
      setTestResult(response.data as TestResult)
    } catch (err) {
      setTestResult({
        ok: false,
        error: 'Could not reach the test endpoint.',
      })
    } finally {
      setTesting(false)
    }
  }

  const handleResync = async () => {
    setResyncing(true)
    try {
      await api.post('/v1/chat-admin/resync')
      setBanner({
        tone: 'success',
        message: 'Catalog resync queued. Embeddings update in the background.',
      })
    } catch (err) {
      setBanner({ tone: 'critical', message: 'Could not queue the resync.' })
    } finally {
      setResyncing(false)
    }
  }

  return (
    <Page
      title="Chat configuration"
      primaryAction={{
        content: 'Save',
        onAction: handleSave,
        loading: saving,
        disabled: loading,
      }}
    >
      <BlockStack gap="400">
        {banner ? (
          <Banner tone={banner.tone} onDismiss={() => setBanner(null)}>
            {banner.message}
          </Banner>
        ) : null}

        {loading ? (
          <InlineStack>
            <Spinner />
          </InlineStack>
        ) : (
          <>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  General
                </Text>
                <Checkbox
                  checked={enabled}
                  onChange={setEnabled}
                  label="Enable the chat widget on my storefront"
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Language model
                </Text>
                <Select
                  label="Provider"
                  options={PROVIDER_OPTIONS}
                  value={llmProvider}
                  onChange={handleProviderChange}
                />
                <TextField
                  label="Model"
                  value={llmModel}
                  onChange={setLlmModel}
                  autoComplete="off"
                />
                <InlineStack>
                  <Button onClick={testConnection} loading={testing}>
                    Test connection
                  </Button>
                  <Text as="span" tone="subdued">
                    Sends a test message to check the key and model.
                  </Text>
                </InlineStack>
                {testResult ? (
                  <Banner
                    tone={testResult.ok ? 'success' : 'critical'}
                    onDismiss={() => setTestResult(null)}
                  >
                    {testResult.ok
                      ? `Connection OK in ${testResult.latencyMs}ms.${
                          testResult.text ? ` Replied: ${testResult.text}` : ''
                        }`
                      : `Connection failed.${
                          testResult.error ? ` ${testResult.error}` : ''
                        }`}
                  </Banner>
                ) : null}
                <TextField
                  label="Custom API key (optional)"
                  type="password"
                  value={apiKey}
                  onChange={setApiKey}
                  autoComplete="off"
                  placeholder={
                    hasCustomApiKey
                      ? 'Key already set'
                      : 'Leave empty to use the platform key'
                  }
                  helpText="Stored encrypted. Fill this in only to set a new key; it is never shown again."
                />
                {hasCustomApiKey ? (
                  <InlineStack>
                    <Button onClick={handleClearKey}>Remove custom key</Button>
                  </InlineStack>
                ) : null}
                <TextField
                  label="System prompt"
                  multiline={4}
                  value={systemPrompt}
                  onChange={setSystemPrompt}
                  autoComplete="off"
                  helpText="Leave empty to use the built-in prompt."
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Retrieval and limits
                </Text>
                <TextField
                  label="Products to retrieve (topK)"
                  type="number"
                  min={1}
                  max={20}
                  value={topK}
                  onChange={setTopK}
                  autoComplete="off"
                />
                <TextField
                  label="Temperature"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={setTemperature}
                  autoComplete="off"
                />
                <TextField
                  label="Rate limit per minute per visitor"
                  type="number"
                  min={1}
                  value={rateLimitPerMin}
                  onChange={setRateLimitPerMin}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Fallback
                </Text>
                <Select
                  label="Fallback mode"
                  options={FALLBACK_MODE_OPTIONS}
                  value={fallbackMode}
                  onChange={setFallbackMode}
                />
                <TextField
                  label="Paid fallback budget cap (USD per day)"
                  type="number"
                  min={0}
                  step={0.5}
                  value={budgetCap}
                  onChange={setBudgetCap}
                  autoComplete="off"
                  helpText="Once this is reached, paid providers are skipped instead of being billed."
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Catalog index
                </Text>
                <Text as="p" tone="subdued">
                  Re-embed the whole product catalog. Product changes are synced
                  automatically through webhooks; use this after changing
                  embedding settings or to rebuild the index.
                </Text>
                <InlineStack>
                  <Button
                    onClick={handleResync}
                    loading={resyncing}
                  >
                    Resync catalog now
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </>
        )}
      </BlockStack>
    </Page>
  )
}
