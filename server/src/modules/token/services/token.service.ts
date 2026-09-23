import { Injectable } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class TokenService {
  prisma: PrismaClient

  constructor() {
    this.prisma = new PrismaClient()
  }
  async upsertToken(body) {
    return this.prisma.tokens.upsert({
      where: {
        id: 1,
      },
      create: {
        token: body.token,
      },
      update: {
        token: body.token,
      },
    })
  }
}
