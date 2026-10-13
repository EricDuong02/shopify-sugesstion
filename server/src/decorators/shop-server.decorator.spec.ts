import { createHmac } from 'crypto'
import { UnauthorizedException } from '@nestjs/common'
import { resolveShopFromRequest } from './shop-server.decorator'

describe('resolveShopFromRequest', () => {
  const secret = 'test-shopify-secret'
  const originalSecret = process.env.SHOPIFY_API_SECRET

  const signQuery = (query: Record<string, string>) => {
    const message = Object.keys(query)
      .sort()
      .map((key) => `${key}=${query[key]}`)
      .join('')
    return createHmac('sha256', secret).update(message).digest('hex')
  }

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

  it('resolves the shop from a valid app proxy signature with storefront query values', () => {
    const query = {
      shop: 'shop-a.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
      id: '12',
      pageType: 'product',
      limit: '8',
    }
    const signature = signQuery(query)

    expect(resolveShopFromRequest({ query: { ...query, signature } })).toBe(
      'shop-a.myshopify.com',
    )
  })

  it('rejects a tampered app proxy query value', () => {
    const query = {
      shop: 'shop-a.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
      id: '12',
      pageType: 'product',
      limit: '8',
    }
    const signature = signQuery(query)

    expect(() =>
      resolveShopFromRequest({
        query: { ...query, id: '13', signature },
      }),
    ).toThrow(UnauthorizedException)
  })

  it('rejects an expired app proxy request', () => {
    const query = {
      shop: 'shop-a.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000) - 301),
      id: '12',
      pageType: 'product',
      limit: '8',
    }
    const signature = signQuery(query)

    expect(() =>
      resolveShopFromRequest({ query: { ...query, signature } }),
    ).toThrow('Shopify app proxy request has expired.')
  })

  it('rejects a mismatched requested shop', () => {
    const query = {
      shop: 'shop-a.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
      id: '12',
      pageType: 'product',
      limit: '8',
    }
    const signature = signQuery(query)

    expect(() =>
      resolveShopFromRequest({
        query: {
          ...query,
          shop: 'shop-b.myshopify.com',
          signature,
        },
      }),
    ).toThrow(UnauthorizedException)
  })

  it('rejects a malformed app proxy signature', () => {
    const query = {
      shop: 'shop-a.myshopify.com',
      timestamp: String(Math.floor(Date.now() / 1000)),
      id: '12',
      pageType: 'product',
      limit: '8',
      signature: 'not-a-hex-signature',
    }

    expect(() => resolveShopFromRequest({ query })).toThrow(
      UnauthorizedException,
    )
  })

  it('does not trust an unverified shop header', () => {
    expect(() =>
      resolveShopFromRequest({
        query: {},
        headers: {
          'x-shop-domain': 'shop-a.myshopify.com',
          'x-shopify-shop-domain': 'shop-a.myshopify.com',
        },
      }),
    ).toThrow(UnauthorizedException)
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
