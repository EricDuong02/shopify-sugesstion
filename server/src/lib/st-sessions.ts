import { Prisma, PrismaClient } from '@prisma/client'
import { Session } from '@shopify/shopify-api'
import { SessionStorage } from '@shopify/shopify-app-session-storage'

export class STSessionStorage implements SessionStorage {
  private prisma: PrismaClient | undefined

  setPrisma(prisma: PrismaClient): void {
    this.prisma = prisma
  }

  private get client(): PrismaClient {
    if (!this.prisma) {
      throw new Error(
        'STSessionStorage has not been configured with PrismaService',
      )
    }
    return this.prisma
  }

  async storeSession(session: Session): Promise<boolean> {
    const payload = { ...session } as unknown as Prisma.InputJsonObject
    try {
      await this.client.appSession.upsert({
        where: { id: session.id },
        create: {
          id: session.id,
          payload: payload,
          shop: session.shop,
        },
        update: { payload: payload },
      })

      return true
    } catch (err) {
      console.log('Error on storeSession', err)
      return false
    }
  }
  async loadSession(id: string): Promise<Session> {
    try {
      const data = await this.client.appSession.findUnique({
        where: { id: id },
      })

      if (!data) {
        return undefined
      }

      const {
        shop,
        state,
        scope,
        accessToken,
        isOnline,
        expires,
        onlineAccessInfo,
      } = data.payload as any

      const session = new Session({ id: data.id, shop, state, isOnline })

      // session.shop = shop;
      // session.state = state;
      // session.isOnline = isOnline;
      session.scope = scope
      session.expires = expires ? new Date(expires) : undefined
      session.accessToken = accessToken
      session.onlineAccessInfo = onlineAccessInfo

      return session
    } catch {
      return undefined
    }
  }
  deleteSession(id: string): Promise<boolean> {
    return this.client.appSession
      .deleteMany({
        where: {
          id: {
            equals: id,
          },
        },
      })
      .then(() => true)
      .catch(() => false)
  }
  deleteSessions(ids: string[]): Promise<boolean> {
    return this.client.appSession
      .deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      })
      .then(() => true)
      .catch(() => false)
  }
  findSessionsByShop(shopName: string): Promise<Session[]> {
    return this.client.appSession
      .findMany({
        where: {
          shop: shopName,
        },
      })
      .then((data) => {
        if (!data) {
          return undefined
        }

        return data.map(({ payload }) => payload) as any
      })
      .catch((err) => {
        console.log('Error on findSessionsByShopCallback', err)
        return []
      })
  }
}
