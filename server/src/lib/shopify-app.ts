import '@shopify/shopify-api/adapters/node'
import { ApiVersion, LogSeverity } from '@shopify/shopify-api'
import { shopifyApp } from '@shopify/shopify-app-express'
import { STSessionStorage } from './st-sessions'

export const sessionStorage = new STSessionStorage()

const host = process.env.HOST ?? 'https://example.com'
const apiConfig = {
  apiKey: process.env.SHOPIFY_API_KEY ?? 'test-api-key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? 'test-api-secret',
  scopes: (process.env.SCOPES ?? 'read_products').split(','),
  hostName: host.replace(/https?:\/\//, ''),
  hostScheme: host.split('://')[0] as 'https',
  apiVersion: ApiVersion.April24,
  isEmbeddedApp: true,
  logger: {
    level: LogSeverity.Info,
  },
}
const shopify = shopifyApp({
  api: apiConfig,
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    // We are going to use nest js to handle this in webhooks.controller.ts
    path: '/api/webhooks',
  },
  sessionStorage,
})

export default shopify
