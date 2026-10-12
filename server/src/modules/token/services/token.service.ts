import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/shared/services/prisma.service'

@Injectable()
export class TokenService {
  constructor(private readonly prisma: PrismaService) {}
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
