import { createHmac, timingSafeEqual } from 'crypto'
import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common'
import { ShopifyService } from '@/shared/services/shopify.service'

type ApiType = 'rest' | 'gql'

type RequestLike = {
  query?: Record<string, unknown>
  headers?: Record<string, unknown>
  [key: string | symbol]: unknown
}

type SessionTokenPayload = {
  aud?: string
  dest?: string
  exp?: number
  nbf?: number
}

const VERIFIED_SHOP = Symbol('verifiedShop')
const APP_PROXY_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60

function normalizeShopDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized)
    ? normalized
    : null
}

function requestQuery(request: RequestLike): Record<string, unknown> {
  return request.query ?? {}
}

function scalarQueryValue(
  query: Record<string, unknown>,
  key: string,
): string | null {
  const value = query[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function apiSecret(): string {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) {
    throw new UnauthorizedException(
      'Shopify API secret is required to verify recommender requests.',
    )
  }
  return secret
}

function shopFromDestination(destination: unknown): string {
  if (typeof destination !== 'string') {
    throw new UnauthorizedException('Shopify session token is missing dest.')
  }

  let hostname: string
  try {
    hostname = new URL(destination).hostname
  } catch {
    throw new UnauthorizedException(
      'Shopify session token has an invalid dest.',
    )
  }

  const shop = normalizeShopDomain(hostname)
  if (!shop) {
    throw new UnauthorizedException(
      'Shopify session token has an invalid shop.',
    )
  }
  return shop
}

function decodeJson(value: string, message: string): Record<string, unknown> {
  try {
    return JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>
  } catch {
    throw new UnauthorizedException(message)
  }
}

function verifySessionToken(token: string): string {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new UnauthorizedException('Invalid Shopify session token format.')
  }

  const [headerPart, payloadPart, signaturePart] = parts
  const header = decodeJson(headerPart, 'Invalid Shopify session token header.')
  if (header.alg !== 'HS256') {
    throw new UnauthorizedException(
      'Unsupported Shopify session token algorithm.',
    )
  }

  const expectedSignature = createHmac('sha256', apiSecret())
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64url')
  const actualSignature = Buffer.from(signaturePart, 'base64url')
  const expectedSignatureBuffer = Buffer.from(expectedSignature, 'base64url')

  if (
    actualSignature.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(actualSignature, expectedSignatureBuffer)
  ) {
    throw new UnauthorizedException('Invalid Shopify session token signature.')
  }

  const payload = decodeJson(
    payloadPart,
    'Invalid Shopify session token payload.',
  ) as SessionTokenPayload
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new UnauthorizedException('Shopify session token is expired.')
  }
  if (typeof payload.nbf === 'number' && payload.nbf > now) {
    throw new UnauthorizedException('Shopify session token is not yet valid.')
  }

  const expectedAudience = process.env.SHOPIFY_API_KEY
  if (expectedAudience && payload.aud !== expectedAudience) {
    throw new UnauthorizedException(
      'Shopify session token has an invalid audience.',
    )
  }

  return shopFromDestination(payload.dest)
}

function verifyAppProxySignature(request: RequestLike): string {
  const query = requestQuery(request)
  const signature = scalarQueryValue(query, 'signature')
  const shop = normalizeShopDomain(query.shop)
  const timestamp = scalarQueryValue(query, 'timestamp')

  if (!signature || !shop || !timestamp) {
    throw new UnauthorizedException(
      'A signed Shopify app proxy request is required for the storefront recommender.',
    )
  }

  const timestampNumber = Number(timestamp)
  if (
    !Number.isInteger(timestampNumber) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) >
      APP_PROXY_TIMESTAMP_TOLERANCE_SECONDS
  ) {
    throw new UnauthorizedException('Shopify app proxy request has expired.')
  }

  const message = Object.keys(query)
    .filter((key) => key !== 'signature')
    .sort()
    .map((key) => {
      const value = query[key]
      if (Array.isArray(value)) return `${key}=${value.join(',')}`
      if (typeof value === 'string' || typeof value === 'number') {
        return `${key}=${value}`
      }
      throw new UnauthorizedException('Invalid Shopify app proxy query.')
    })
    .join('')

  const expectedSignature = createHmac('sha256', apiSecret())
    .update(message)
    .digest('hex')
  const actualSignature = Buffer.from(signature, 'hex')
  const expectedSignatureBuffer = Buffer.from(expectedSignature, 'hex')
  if (
    actualSignature.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(actualSignature, expectedSignatureBuffer)
  ) {
    throw new UnauthorizedException('Invalid Shopify app proxy signature.')
  }

  return shop
}

function bearerToken(request: RequestLike): string | null {
  const authorization = request.headers?.authorization
  if (typeof authorization !== 'string') return null

  const match = authorization.match(/^Bearer\s+(\S+)$/i)
  return match?.[1] ?? null
}

/**
 * Resolve the shop only from a verified Shopify credential.
 *
 * Recommender routes are excluded from Shopify's global middleware because the
 * storefront route is reached through an app proxy. Consequently, neither a
 * raw `?shop=` value nor an `x-shop-domain` header is an authorization signal.
 * Embedded app requests use a signed session token; storefront requests use a
 * signed Shopify app-proxy query string.
 */
export function resolveShopFromRequest(request: RequestLike): string {
  const cached = request[VERIFIED_SHOP]
  if (typeof cached === 'string') return cached

  const token = bearerToken(request)
  const shop = token
    ? verifySessionToken(token)
    : verifyAppProxySignature(request)

  const requestedShop = normalizeShopDomain(requestQuery(request).shop)
  if (requestedShop && requestedShop !== shop) {
    throw new UnauthorizedException(
      'The requested shop does not match the verified Shopify credential.',
    )
  }

  request[VERIFIED_SHOP] = shop
  return shop
}

let shopifyService: ShopifyService | undefined

export function configureShopifyServerDecorator(service: ShopifyService): void {
  shopifyService = service
}

/** Inject the shop proven by the Shopify session token or app proxy signature. */
export const ShopifyShop = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    resolveShopFromRequest(ctx.switchToHttp().getRequest() as RequestLike),
)

export const ShopifyServer = createParamDecorator(
  async (apiType: ApiType = 'gql', ctx: ExecutionContext) => {
    const shopDomain = resolveShopFromRequest(
      ctx.switchToHttp().getRequest() as RequestLike,
    )
    if (!shopifyService) {
      throw new Error('ShopifyServer decorator has not been configured.')
    }

    return shopifyService.getClientForShop(shopDomain, apiType)
  },
)
