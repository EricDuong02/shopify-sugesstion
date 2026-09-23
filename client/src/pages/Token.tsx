import { UPSERT_TOKEN } from '@/const'
import { useApi } from '@/hooks/useApi'
import { useToast } from '@shopify/app-bridge-react'
import { Button, Card, Layout, Page, TextField } from '@shopify/polaris'
import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

function AccessTokenPage() {
  const api = useApi()
  const { show } = useToast()
  const [label, setLabel] = useState('')

  console.log(label)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)

  const handleLabelChange = (value: string) => {
    setLabel(value)
  }

  const handleGenerateToken = async () => {
    try {
      await api.post(UPSERT_TOKEN, { token: label })
      show('Create or update token success! 🎉', {
        duration: 2000,
        onDismiss: () => console.log('👋 Toast dismissed'),
      })
    } catch (error) {
      show('Fail create or update token success! 🎉', {
        duration: 2000,
        onDismiss: () => console.log('👋 Toast dismissed'),
      })
      console.error('Error:', error)
    }
  }

  const handleGenerateUUIDToken = () => {
    const newToken = uuidv4()
    setGeneratedToken(`Generated token using uuid: ${newToken}`)
  }

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <TextField
              label="Label"
              value={label}
              onChange={handleLabelChange}
              autoComplete="off"
            />
            <div style={{ marginTop: '1rem' }}>
              <Button onClick={handleGenerateToken}>
                Create or Update new access token
              </Button>
            </div>
            <div style={{ marginTop: '1rem' }}>
              <Button onClick={handleGenerateUUIDToken}>
                Generate UUID access token
              </Button>
            </div>
            {generatedToken && (
              <div style={{ marginTop: '1rem' }}>
                <p>{generatedToken}</p>
              </div>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  )
}

export default AccessTokenPage
