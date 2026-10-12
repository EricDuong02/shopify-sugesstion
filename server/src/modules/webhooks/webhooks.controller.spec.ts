import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from '@/shared/services/prisma.service'
import { WebhooksController } from './webhooks.controller'

describe('WebhooksController', () => {
  let controller: WebhooksController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            appSession: { deleteMany: jest.fn() },
          },
        },
      ],
    }).compile()

    controller = module.get<WebhooksController>(WebhooksController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
