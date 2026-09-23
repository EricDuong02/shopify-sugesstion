import { Injectable } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { RecommendDto } from '../dtos/recommends.dto'
import { PageType } from '@/types/RecommendApi'
import { pageOptions } from '@/data'
import { ListProductService } from './list-product.service'
import { GraphqlClient } from '@shopify/shopify-api'

@Injectable()
export class RecommenderApiService {
  prisma: PrismaClient
  listProductService: ListProductService
  constructor() {
    this.prisma = new PrismaClient()
    this.listProductService = new ListProductService()
  }

  async getData(gqlClient: GraphqlClient, query: RecommendDto) {
    const dataCondition = await this.prisma.offerProduct.findFirst({
      where: {
        id: +query.id || undefined,
      },
      include: {
        productGroups: {
          include: {
            rules: true,
          },
        },
        triggerProduct: {
          include: {
            productGroups: {
              include: {
                rules: true,
              },
            },
          },
        },
        fallBackProduct: {
          include: {
            productGroups: {
              include: {
                rules: true,
              },
            },
          },
        },
      },
    })

    const productGroups = dataCondition.triggerProduct.productGroups[0]
    const typeId = productGroups.typeId
    const rules = productGroups.rules

    const count = await this.listProductService.countProduct(
      gqlClient,
      typeId,
      rules,
    )

    const countMap = count.reduce((map, obj) => {
      map[obj.id] = obj.count
      return map
    }, {})
    rules.sort((a, b) => countMap[a.id] - countMap[b.id])

    const listDataTrigger = await this.listProductService.getDataByCondition(
      gqlClient,
      50,
      typeId,
      rules,
    )

    const fallbackProductGroups = dataCondition.fallBackProduct
      ? dataCondition.fallBackProduct.productGroups[0]
      : null
    const listDataFallback = fallbackProductGroups
      ? await this.listProductService.getDataByCondition(
          gqlClient,
          50,
          fallbackProductGroups.typeId,
          fallbackProductGroups.rules,
        )
      : []

    const mergedData = this.listProductService.mergeLists(
      listDataTrigger,
      listDataFallback,
    )

    return {
      id: dataCondition.id,
      name: dataCondition.name,
      products: mergedData,
    }
  }

  async getManyData(
    pageType: PageType,
    limit = 20,
    search: string | undefined,
    listIds: string | undefined,
  ) {
    if (!Object.values(PageType).includes(pageType as PageType)) {
      throw new Error(`${pageType} is a valid PageType.`)
    }

    const valuePage = pageOptions.find(
      (data) => data.pageOptions === pageType,
    ).value
    const data = await this.prisma.offerProduct.findMany({
      where: {
        name: {
          search: search,
        },
        ...(listIds ? { id: { in: JSON.parse(listIds) } } : {}),
        triggerProduct: {
          is: {
            pageIds: {
              hasSome: [+valuePage],
            },
          },
        },
      },
      take: limit,
    })

    return data.map((item) => ({
      id: item.id,
      name: item.name,
    }))
  }
}
