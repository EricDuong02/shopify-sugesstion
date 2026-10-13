import { PrismaService } from '@/shared/services/prisma.service'
import { ShopifyService } from '@/shared/services/shopify.service'
import { LlmRegistryService } from '../../chat/llm/llm-registry.service'
import { CatalogSyncService } from './catalog-sync.service'

const createService = () =>
  new CatalogSyncService(
    new PrismaService(),
    new ShopifyService(null),
    new LlmRegistryService(),
    null,
  )

describe('CatalogSyncService selected product hydration', () => {
  it('deduplicates IDs and disables embeddings during hydration', async () => {
    const service = createService()
    const syncProduct = jest
      .spyOn(service, 'syncProduct')
      .mockResolvedValue(undefined)

    await service.ensureProductsSynced('shop.example.com', [
      'gid://shopify/Product/101',
      '101',
      102,
    ])

    expect(syncProduct).toHaveBeenCalledTimes(2)
    expect(syncProduct).toHaveBeenNthCalledWith(1, 'shop.example.com', '101', {
      refreshEmbedding: false,
    })
    expect(syncProduct).toHaveBeenNthCalledWith(2, 'shop.example.com', '102', {
      refreshEmbedding: false,
    })
  })

  it('rejects malformed product IDs before making Shopify calls', async () => {
    const service = createService()
    const syncProduct = jest.spyOn(service, 'syncProduct')

    await expect(
      service.ensureProductsSynced('shop.example.com', ['not-a-product-id']),
    ).rejects.toThrow('Invalid Shopify product ID')
    expect(syncProduct).not.toHaveBeenCalled()
  })

  it('limits one hydration request to 50 products', async () => {
    const service = createService()
    const syncProduct = jest
      .spyOn(service, 'syncProduct')
      .mockResolvedValue(undefined)
    const ids = Array.from({ length: 51 }, (_, index) => String(index + 1))

    await expect(
      service.ensureProductsSynced('shop.example.com', ids),
    ).rejects.toThrow('Too many products')
    expect(syncProduct).not.toHaveBeenCalled()
  })

  it('runs no more than four product syncs concurrently', async () => {
    const service = createService()
    let active = 0
    let maximumActive = 0
    jest.spyOn(service, 'syncProduct').mockImplementation(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setImmediate(resolve))
      active -= 1
    })

    await service.ensureProductsSynced(
      'shop.example.com',
      Array.from({ length: 9 }, (_, index) => String(index + 1)),
    )

    expect(maximumActive).toBeLessThanOrEqual(4)
  })
})
