import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

/**
 * Single Nest-managed Prisma database port for application services.
 *
 * Non-Nest Shopify integration points are configured with this same instance
 * during bootstrap; controllers, services, and guards inject this service.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
