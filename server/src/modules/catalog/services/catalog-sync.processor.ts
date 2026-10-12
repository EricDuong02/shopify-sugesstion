import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { CATALOG_SYNC_QUEUE, CatalogSyncService } from './catalog-sync.service'

/**
 * BullMQ worker for catalog embedding jobs. Runs inside the NestJS
 * process; heavy embedding work never blocks chat request handlers.
 */
@Processor(CATALOG_SYNC_QUEUE)
export class CatalogSyncProcessor extends WorkerHost {
  constructor(private readonly catalogSync: CatalogSyncService) {
    super()
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'sync-product':
        await this.catalogSync.syncProduct(job.data.shop, job.data.productId)
        break
      case 'resync-shop':
        await this.catalogSync.resyncShop(job.data.shop)
        break
      default:
        console.warn(`[catalog-sync] unknown job: ${job.name}`)
    }
  }
}
