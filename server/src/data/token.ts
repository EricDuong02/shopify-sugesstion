import { PrismaService } from '@/shared/services/prisma.service'

export const getToken = async (prisma: PrismaService) => {
  try {
    return await prisma.tokens.findFirst()
  } catch {
    return null
  }
}
