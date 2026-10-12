import { createHmac } from 'crypto'
import { UnauthorizedException } from '@nestjs/common'
import { resolveShopFromRequest } from './shop-server.decorator'

describe('resolveShopFromRequest', () => {
  const secret = 'test-shopify-secret'
  const originalSecret = process.env.SHOPIFY_API_SECRET

  beforeEach(() => {
    process.env.SHOPIFY_API_SECRET = secret
    delete process.env.SHOPIFY_API_KEY
  })

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.SHOPIFY_API_SECRET
    } else {
      process.env.SHOPIFY_API_SECRET = originalSecret
    }
  })

  it('rejects a raw shop query without a Shopify credential', () => {
    expect(() =>
      resolveShopFromRequest({
        query: { shop: 'shop-a.myshopify.com' },
        headers: {},
      }),
    ).toThrow(UnauthorizedException)
  })

  it('resolves the shop from a valid app proxy signature', () => {
    const query = {
      shop: 'shop-a.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
    }
    const message = Object.keys(query)
      .sort()
      .map((key) => `${key}=${query[key]}`)
      .join('')
    const signature = createHmac('sha256', secret).update(message).digest('hex')

    expect(resolveShopFromRequest({ query: { ...query, signature } })).toBe(
      'shop-a.myshopify.com',
    )
  })

  it('resolves the shop from a valid embedded session token', () => {
    const encode = (value: Record<string, unknown>) =>
      Buffer.from(JSON.stringify(value)).toString('base64url')
    const header = encode({ alg: 'HS256', typ: 'JWT' })
    const payload = encode({
      dest: 'https://shop-b.myshopify.com/admin',
      exp: Math.floor(Date.now() / 1000) + 60,
    })
    const token = `${header}.${payload}.${createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url')}`

    expect(
      resolveShopFromRequest({
        query: { shop: 'shop-b.myshopify.com' },
        headers: { authorization: `Bearer ${token}` },
      }),
    ).toBe('shop-b.myshopify.com')
  })
})
