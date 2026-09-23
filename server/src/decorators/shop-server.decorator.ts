import shopify from '@/lib/shopify-app'
import { createParamDecorator } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { Session } from '@shopify/shopify-api' // Import Session

type ApiType = 'rest' | 'gql'

export const ShopifyServer = createParamDecorator(
  async (apiType: ApiType = 'gql') => {
    try {
      const prisma = new PrismaClient()
      const data = await prisma.appSession.findFirst()

      const session = data.payload as unknown as Session

      if (!session) {
        throw new Error('Session token could not be retrieved.')
      }

      if (apiType === 'rest') {
        return new shopify.api.clients.Rest({ session })
      }

      return new shopify.api.clients.Graphql({ session })
    } catch (error) {
      console.error('Error retrieving Shopify client:', error)
      throw new Error('Failed to create Shopify client.')
    }
  },
)
