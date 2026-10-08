import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * AES-256-GCM helpers for per-shop API key overrides stored in the database
 * (ChatShopConfig.llmApiKeyEnc). The master key comes from
 * CONFIG_ENCRYPTION_KEY.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getMasterKey(): Buffer {
  const key = Buffer.from(process.env.CONFIG_ENCRYPTION_KEY || '', 'hex')
  if (key.length !== 32) {
    throw new Error(
      'CONFIG_ENCRYPTION_KEY must be a 32-byte hex string (generate with: openssl rand -hex 32)',
    )
  }
  return key
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getMasterKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptSecret(payload: string): string {
  const data = Buffer.from(payload, 'base64')
  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, getMasterKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  )
}
