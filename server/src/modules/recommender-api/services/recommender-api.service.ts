import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '@/shared/services/prisma.service'
import { RecommendDto } from '../dtos/recommends.dto'
import { ThemeCampaignsDto } from '../dtos/theme-campaigns.dto'
import { ThemeRecommendationDto } from '../dtos/theme-recommendation.dto'
import { PageType } from '@/types/RecommendApi'
import { pageOptions } from '@/data'
import {
  RecommendationCacheService,
  RecommendationSnapshot,
} from '../../recommendation-cache/services/recommendation-cache.service'

const THEME_DEFAULT_PRODUCT_LIMIT = 8
const THEME_MAX_PRODUCT_LIMIT = 50
const THEME_DEFAULT_CAMPAIGN_LIMIT = 20
const THEME_MAX_CAMPAIGN_LIMIT = 50
const ACTIVE_PRODUCT_STATUS = 'ACTIVE'

type ThemeCatalogVariant = {
  price: number | null
  compareAtPrice: number | null
  availableForSale: boolean | null
}

type ThemeCatalogProduct = {
  shopifyProductId: string
  onlineStoreUrl: string | null
  featuredImageUrl: string | null
  title: string
  handle: string | null
  status: string | null
  publishedAt: Date | null
  minPrice: number | null
  currencyCode: string | null
  variants: ThemeCatalogVariant[]
}

function isPageType(value: string): value is PageType {
  return Object.values(PageType).some((pageType) => pageType === value)
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

function themeCampaignLimit(rawLimit: string | undefined): number {
  if (!rawLimit) return THEME_DEFAULT_CAMPAIGN_LIMIT

  const limit = Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1) {
    throw new BadRequestException(
      'Recommendation campaign limit must be positive',
    )
  }

  return Math.min(limit, THEME_MAX_CAMPAIGN_LIMIT)
}

function isSafeHttpUrl(value: string | null): value is string {
  if (!value) return false

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function productUrl(product: ThemeCatalogProduct): string | null {
  if (product.onlineStoreUrl !== null) {
    return isSafeHttpUrl(product.onlineStoreUrl) ? product.onlineStoreUrl : null
  }

  if (!product.handle) return null

  return `/products/${encodeURIComponent(product.handle)}`
}

function compareAtPriceForProduct(
  price: number | null,
  variants: ThemeCatalogVariant[],
): number | null {
  if (price === null || !Number.isFinite(price)) return null

  const eligibleCompareAtPrices = variants
    .filter(
      (variant) =>
        variant.availableForSale !== false &&
        variant.price === price &&
        variant.compareAtPrice !== null &&
        Number.isFinite(variant.compareAtPrice) &&
        variant.compareAtPrice > price,
    )
    .map((variant) => variant.compareAtPrice)
    .filter((value): value is number => value !== null)

  return eligibleCompareAtPrices.length
    ? Math.min(...eligibleCompareAtPrices)
    : null
}

function toThemeProduct(product: ThemeCatalogProduct) {
  const url = productUrl(product)
  if (
    product.status !== ACTIVE_PRODUCT_STATUS ||
    !product.publishedAt ||
    product.publishedAt > new Date() ||
    !url
  ) {
    return null
  }

  return {
    id: product.shopifyProductId,
    url,
    avatarSource: isSafeHttpUrl(product.featuredImageUrl)
      ? product.featuredImageUrl
      : null,
    name: product.title,
    handle: product.handle,
    status: product.status,
    price: product.minPrice,
    compareAtPrice: compareAtPriceForProduct(
      product.minPrice,
      product.variants,
    ),
    currencyCode: product.currencyCode,
  }
}

import { ListProductService } from './list-product.service'
import { GraphqlClient } from '@shopify/shopify-api'

@Injectable()
export class RecommenderApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listProductService: ListProductService,
    private readonly recommendationCache: RecommendationCacheService,
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
                currencyCode: true,
                variants: {
                  where: { shopId: shop },
                  select: {
                    price: true,
                    compareAtPrice: true,
                    availableForSale: true,
                  },
                },
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
        compareAtPrice: compareAtPriceForProduct(
          catalogProduct.minPrice,
          catalogProduct.variants,
        ),
        currencyCode: catalogProduct.currencyCode,
      })),
    }
  }

  async getThemeData(query: ThemeRecommendationDto, shop: string) {
    if (!query.id) {
      throw new BadRequestException('Recommendation campaign ID is required')
    }

    const productLimit = themeProductLimit(query.limit)
    const offerId = this.offerId(query.id)

    return this.recommendationCache.getOrLoad(
      shop,
      offerId,
      query.pageType,
      productLimit,
      async (): Promise<RecommendationSnapshot> => {
        const now = new Date()
        const dataCondition = await this.prisma.offerProduct.findFirst({
          where: {
            shopId: shop,
            id: offerId,
          },
          select: {
            id: true,
            name: true,
            triggerProduct: {
              select: {
                scheduleOn: true,
              },
            },
            items: {
              where: {
                shopId: shop,
                catalogProduct: {
                  status: ACTIVE_PRODUCT_STATUS,
                  publishedAt: { not: null, lte: now },
                },
              },
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
                    publishedAt: true,
                    minPrice: true,
                    currencyCode: true,
                    variants: {
                      where: { shopId: shop },
                      select: {
                        price: true,
                        compareAtPrice: true,
                        availableForSale: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })

        if (!dataCondition) {
          throw new NotFoundException(
            `OfferProduct with id ${query.id} not found`,
          )
        }

        const triggerProduct = dataCondition.triggerProduct
        const isApplicable = triggerProduct?.scheduleOn === true

        return {
          id: dataCondition.id,
          name: dataCondition.name,
          products: isApplicable
            ? dataCondition.items
                .map(({ catalogProduct }) => toThemeProduct(catalogProduct))
                .filter((product): product is NonNullable<typeof product> =>
                  Boolean(product),
                )
            : [],
        }
      },
    )
  }

  async getThemeCampaignList(
    query: ThemeCampaignsDto,
    shop: string,
  ): Promise<{
    campaigns: Array<{ id: number; name: string }>
  }> {
    const campaignLimit = themeCampaignLimit(query.limit)
    const now = new Date()

    const campaigns = await this.prisma.offerProduct.findMany({
      where: {
        shopId: shop,
        triggerProduct: {
          is: {
            scheduleOn: true,
          },
        },
        items: {
          some: {
            shopId: shop,
            catalogProduct: {
              status: ACTIVE_PRODUCT_STATUS,
              publishedAt: { not: null, lte: now },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: campaignLimit,
      select: { id: true, name: true },
    })

    return { campaigns }
  }

  async getThemeCampaigns(
    query: ThemeCampaignsDto,
    shop: string,
  ): Promise<{
    campaigns: RecommendationSnapshot[]
  }> {
    const campaignLimit = themeCampaignLimit(query.limit)
    const productLimit = themeProductLimit(query.productLimit)
    const now = new Date()

    const campaigns = await this.prisma.offerProduct.findMany({
      where: {
        shopId: shop,
        triggerProduct: {
          is: {
            scheduleOn: true,
          },
        },
        items: {
          some: {
            shopId: shop,
            catalogProduct: {
              status: ACTIVE_PRODUCT_STATUS,
              publishedAt: { not: null, lte: now },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: campaignLimit,
      select: {
        id: true,
        name: true,
        items: {
          where: {
            shopId: shop,
            catalogProduct: {
              status: ACTIVE_PRODUCT_STATUS,
              publishedAt: { not: null, lte: now },
            },
          },
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
                publishedAt: true,
                minPrice: true,
                currencyCode: true,
                variants: {
                  where: { shopId: shop },
                  select: {
                    price: true,
                    compareAtPrice: true,
                    availableForSale: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    return {
      campaigns: campaigns
        .map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          products: campaign.items
            .map(({ catalogProduct }) => toThemeProduct(catalogProduct))
            .filter((product): product is NonNullable<typeof product> =>
              Boolean(product),
            ),
        }))
        .filter((campaign) => campaign.products.length > 0),
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

    const isSupportedPlacement = pageOptions.some(
      (data) => data.pageOptions === pageType,
    )
    if (!isSupportedPlacement) {
      throw new BadRequestException(
        `Page type ${pageType} is not supported by recommendation placements`,
      )
    }

    const data = await this.prisma.offerProduct.findMany({
      where: {
        shopId: shop,
        name: {
          search: search,
        },
        ...(listIds ? { id: { in: JSON.parse(listIds) } } : {}),
        triggerProduct: {
          is: {
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
