// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

const recommendationScript = readFileSync(
  new URL('../../extensions/chat-widget/assets/recommendation.js', import.meta.url),
  'utf8',
)

const createProduct = (id, overrides = {}) => ({
  id,
  name: `Product ${id}`,
  url: `https://shop.example.com/products/${id}`,
  price: 10,
  compareAtPrice: null,
  currencyCode: 'USD',
  ...overrides,
})

const renderRecommendation = async (products, rows = 1) => {
  document.body.innerHTML = `
    <div
      class="recommendation-widget"
      data-page-type="index"
      data-rows="${rows}"
      data-columns="4"
      data-mobile-columns="1"
    ></div>
  `

  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ name: 'Campaign', products }),
  })
  globalThis.fetch = fetchMock
  window.fetch = fetchMock

  window.eval(recommendationScript)
  document.dispatchEvent(new Event('DOMContentLoaded'))
  await new Promise((resolve) => setTimeout(resolve, 0))

  return document.querySelector('.recommendation-widget')
}

it('splits products into balanced independent rows', async () => {
  const root = await renderRecommendation(
    [1, 2, 3, 4, 5].map((id) => createProduct(id)),
    2,
  )

  const rows = root.querySelectorAll('.recommendation-widget__row')

  expect(rows).toHaveLength(2)
  expect(rows[0].querySelectorAll('.recommendation-widget__slide')).toHaveLength(3)
  expect(rows[1].querySelectorAll('.recommendation-widget__slide')).toHaveLength(2)
  expect(rows[0].querySelectorAll('button')).toHaveLength(2)
  expect(rows[1].querySelectorAll('button')).toHaveLength(2)
})

it('renders a sale price only when compare-at price is higher', async () => {
  const root = await renderRecommendation([
    createProduct(1, { price: 10, compareAtPrice: 15 }),
    createProduct(2, { price: 10, compareAtPrice: 10 }),
  ])

  const cards = root.querySelectorAll('.recommendation-widget__card')

  expect(cards[0].querySelector('del')).not.toBeNull()
  expect(cards[0].querySelector('.recommendation-widget__price--sale')).not.toBeNull()
  expect(cards[1].querySelector('del')).toBeNull()
  expect(cards[1].querySelector('.recommendation-widget__price--sale')).toBeNull()
})

it('hides the widget when product data cannot produce safe links', async () => {
  const root = await renderRecommendation([
    null,
    { name: 'Unsafe', url: 'javascript:alert(1)' },
    { name: 'Missing URL' },
  ])

  expect(root.hidden).toBe(true)
  expect(root.querySelector('.recommendation-widget__card')).toBeNull()
})
