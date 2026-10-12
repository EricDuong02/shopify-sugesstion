import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from './prisma.service'
import { ShopifyService } from './shopify.service'

describe('ShopifyService', () => {
  let service: ShopifyService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile()

    service = module.get<ShopifyService>(ShopifyService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
