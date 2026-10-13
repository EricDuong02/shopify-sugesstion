import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '@/shared/services/prisma.service'
import { RecommendDto } from '../dtos/recommends.dto'
import { ThemeRecommendationDto } from '../dtos/theme-recommendation.dto'
import { PageType } from '@/types/RecommendApi'
import { pageOptions } from '@/data'

const THEME_DEFAULT_PRODUCT_LIMIT = 8
const THEME_MAX_PRODUCT_LIMIT = 50

function isPageType(value: string): value is PageType {
  return Object.values(PageType).some((pageType) => pageType === value)
}

function pageIdForType(pageType: PageType): number {
  const pageOption = pageOptions.find(
    (option) => option.pageOptions === pageType,
  )
  if (!pageOption) {
    throw new BadRequestException(
      `Page type ${pageType} is not supported by recommendation placements`,
    )
  }

  return Number(pageOption.value)
}

function themeProductLimit(rawLimit: string | undefined): number {
  if (!rawLimit) return THEME_DEFAULT_PRODUCT_LIMIT

  const limit = Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1) {
    throw new BadRequestException(
      'Recommendation product limit must be positive',
    )
  }

  return Math.min(limit, THEME_MAX_PRODUCT_LIMIT)
}
import { ListProductService } from './list-product.service'
import { GraphqlClient } from '@shopify/shopify-api'

@Injectable()
export class RecommenderApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listProductService: ListProductService,
  ) {}

  private offerId(value: string): number {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) {
      throw new NotFoundException(`OfferProduct with id ${value} not found`)
    }
    return id
  }

  /** Storefront-only path: evaluate the offer rules against this shop's ShopifyQL client. */
  async getData(gqlClient: GraphqlClient, query: RecommendDto, shop: string) {
    const dataCondition = await this.prisma.offerProduct.findFirst({
      where: {
        shopId: shop,
        id: this.offerId(query.id),
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

    if (!dataCondition) {
      throw new NotFoundException(`OfferProduct with id ${query.id} not found`)
    }

    if (!dataCondition.triggerProduct) {
      throw new NotFoundException(
        `OfferProduct ${dataCondition.id} has no trigger product`,
      )
    }

    const productGroups = dataCondition.triggerProduct.productGroups[0]

    if (!productGroups) {
      throw new NotFoundException(
        `Trigger product of OfferProduct ${dataCondition.id} has no product groups`,
      )
    }

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
      query.customerId,
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
          query.customerId,
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

  /**
   * Read the canonical offer snapshot used by the embedded admin UI.
   *
   * Unlike the storefront endpoint above, this path must not re-evaluate
   * ShopifyQL rules against a client selected by request data. OfferProductItem
   * is populated during offer create/update and joins to CatalogProduct with
   * the same shop key, so a mismatched shop cannot expose another tenant's
   * products.
   */
  async getPersistedData(query: RecommendDto, shop: string) {
    const dataCondition = await this.prisma.offerProduct.findFirst({
      where: {
        shopId: shop,
        id: this.offerId(query.id),
      },
      select: {
        id: true,
        name: true,
        items: {
          where: { shopId: shop },
          orderBy: { position: 'asc' },
          select: {
            catalogProduct: {
              select: {
                shopifyProductId: true,
                onlineStoreUrl: true,
                featuredImageUrl: true,
                title: true,
                handle: true,
                status: true,
                minPrice: true,
              },
            },
          },
        },
      },
    })

    if (!dataCondition) {
      throw new NotFoundException(`OfferProduct with id ${query.id} not found`)
    }

    return {
      id: dataCondition.id,
      name: dataCondition.name,
      products: dataCondition.items.map(({ catalogProduct }) => ({
        id: catalogProduct.shopifyProductId,
        url: catalogProduct.onlineStoreUrl,
        avatarSource: catalogProduct.featuredImageUrl,
        name: catalogProduct.title,
        handle: catalogProduct.handle,
        status: catalogProduct.status,
        price: catalogProduct.minPrice,
      })),
    }
  }

  async getThemeData(query: ThemeRecommendationDto, shop: string) {
    const pageId = pageIdForType(query.pageType)
    const productLimit = themeProductLimit(query.limit)
    const dataCondition = await this.prisma.offerProduct.findFirst({
      where: {
        shopId: shop,
        id: this.offerId(query.id),
        triggerProduct: {
          is: {
            scheduleOn: true,
            pageIds: { has: pageId },
          },
        },
      },
      select: {
        id: true,
        name: true,
        items: {
          where: { shopId: shop },
          orderBy: { position: 'asc' },
          take: productLimit,
          select: {
            catalogProduct: {
              select: {
                shopifyProductId: true,
                onlineStoreUrl: true,
                featuredImageUrl: true,
                title: true,
                handle: true,
                status: true,
                minPrice: true,
              },
            },
          },
        },
      },
    })

    if (!dataCondition) {
      throw new NotFoundException(
        `Active OfferProduct with id ${query.id} is not configured for ${query.pageType}`,
      )
    }

    return {
      id: dataCondition.id,
      name: dataCondition.name,
      products: dataCondition.items.map(({ catalogProduct }) => ({
        id: catalogProduct.shopifyProductId,
        url: catalogProduct.onlineStoreUrl,
        avatarSource: catalogProduct.featuredImageUrl,
        name: catalogProduct.title,
        handle: catalogProduct.handle,
        status: catalogProduct.status,
        price: catalogProduct.minPrice,
      })),
    }
  }

  async getManyData(
    pageType: string,
    limit = 20,
    search: string | undefined,
    listIds: string | undefined,
    shop: string,
  ) {
    if (!isPageType(pageType)) {
      throw new BadRequestException(`Unsupported page type: ${pageType}`)
    }

    const pageOption = pageOptions.find((data) => data.pageOptions === pageType)
    if (!pageOption) {
      throw new BadRequestException(
        `Page type ${pageType} is not supported by recommendation placements`,
      )
    }
    const valuePage = pageOption.value
    const data = await this.prisma.offerProduct.findMany({
      where: {
        shopId: shop,
        name: {
          search: search,
        },
        ...(listIds ? { id: { in: JSON.parse(listIds) } } : {}),
        triggerProduct: {
          is: {
            pageIds: {
              hasSome: [+valuePage],
            },
            scheduleOn: true,
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
