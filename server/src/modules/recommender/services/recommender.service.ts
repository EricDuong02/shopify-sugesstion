import { DATA_PER_PAGE, MAX_QUERY_NUMBER } from '@/const/utils'
import { PRODUCT_PAGE_ID, TRIGGER_PAGE_IDS } from '@/data'
import { FetchBrandsResponse, FetchCategoryResponse } from '@/types/Recommend'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { PrismaService } from '@/shared/services/prisma.service'
import { CatalogSyncService } from '@/modules/catalog/services/catalog-sync.service'
import { GraphqlClient } from '@shopify/shopify-api'
import { ListProductService } from '@/modules/recommender-api/services/list-product.service'
import { CreateProductRecommenderDto } from '../dtos/create-product-recommender.dto'
import { GetDetail } from '../dtos/get-detail.dto'
import { RecommendDto } from '../dtos/recommends.dto'
import { UpdateProductRecommenderDto } from '../dtos/update-product-recommender.dto'

type RecommenderRuleInput = {
  id?: string | number
  column: string | number
  relation: string | number
  value: string[]
}

type ProductGroupInput = {
  typeId: string[]
  ids: Array<string | number>
  rules: RecommenderRuleInput[]
}

type OfferCandidate = {
  id: string | null
  source: 'trigger' | 'fallback'
}

@Injectable()
export class RecommenderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listProductService: ListProductService,
    private readonly catalogSyncService: CatalogSyncService,
  ) {}

  async fetchProductsGQL(gqlClient, query) {
    const search = query.search
    const first = DATA_PER_PAGE
    const afterCursor = query.afterCursor

    const products = await gqlClient.query({
      data: `{
        products(first: ${first} ${search ? `, query: "title:*${search}*"` : ``} ${afterCursor ? `, after: "${afterCursor}"` : ``}) {
          edges {
            node {
              id
              title
              handle
              description
            }
            cursor
          }
          pageInfo {
            hasNextPage
          }
        }
      }`,
    })

    return products.body
  }

  async fetchBrandsGQLByVendor(gqlClient: GraphqlClient, afterCursor: string) {
    const vendor = await gqlClient.query<{ data: FetchBrandsResponse }>({
      data: `{
        products(first: 250 ${afterCursor ? `, after: "${afterCursor}"` : ''}) {
          edges {
            node {
              vendor
            }
            cursor
          }
          pageInfo {
            hasNextPage
          }
        }
      }`,
    })

    return vendor.body
  }

  //pending collection using logic get by vendor
  async fetchCategoryGQLByCollection(gqlClient: GraphqlClient) {
    let hasNextPage = true
    let endCursor: string | null = null
    const allCollections: Array<{ id: string; title: string }> = []

    while (hasNextPage) {
      const response = await gqlClient.query<{ data: FetchCategoryResponse }>({
        data: `{
        collections(first: ${MAX_QUERY_NUMBER}, after: ${endCursor ? `"${endCursor}"` : null}) {
          edges {
            node {
              id
              title
            }
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }`,
      })

      const { edges, pageInfo } = response.body.data.collections
      allCollections.push(...edges.map((edge) => edge.node))
      endCursor = pageInfo.endCursor
      hasNextPage = pageInfo.hasNextPage
    }

    return { data: allCollections }
  }

  private normalizeProductId(
    value: string | number | null | undefined,
  ): string | null {
    if (value === null || value === undefined) return null
    const normalized = String(value).trim().split('/').pop()
    if (!normalized || !/^\d+$/.test(normalized)) {
      throw new BadRequestException(`Invalid Shopify product ID: ${value}`)
    }
    return normalized
  }

  private normalizeConditionRules(rules: RecommenderRuleInput[]) {
    return rules.map((rule, index) => ({
      id: Number(rule.id) || index,
      column: Number(rule.column),
      relation: Number(rule.relation),
      value: rule.value,
      productGroupsId: null,
      updatedAt: new Date(),
      createdAt: new Date(),
    }))
  }

  private normalizePageIds(
    pageIds: Array<string | number> | null | undefined,
  ): number[] {
    if (!Array.isArray(pageIds)) {
      throw new BadRequestException('Trigger page IDs must be an array')
    }

    const allowedPageIds = new Set(TRIGGER_PAGE_IDS.map(Number))
    const normalized = pageIds.map((pageId) => {
      const value = Number(pageId)
      if (!Number.isInteger(value) || !allowedPageIds.has(value)) {
        throw new BadRequestException(`Unsupported trigger page ID: ${pageId}`)
      }
      return value
    })

    return [...new Set(normalized)]
  }

  private normalizeTriggerGroup(
    pageIds: number[],
    group: ProductGroupInput,
  ): ProductGroupInput {
    return pageIds.includes(PRODUCT_PAGE_ID)
      ? group
      : { ...group, typeId: [], ids: [], rules: [] }
  }

  private async ensureCatalogProducts(
    shop: string,
    ids: string[],
  ): Promise<Set<string>> {
    let catalogProducts = await this.prisma.catalogProduct.findMany({
      where: {
        shopId: shop,
        shopifyProductId: { in: ids },
      },
      select: { shopifyProductId: true },
    })

    let catalogIds = new Set(
      catalogProducts.map((product) => product.shopifyProductId),
    )
    const missingCatalogIds = ids.filter((id) => !catalogIds.has(id))

    if (missingCatalogIds.length > 0) {
      try {
        await this.catalogSyncService.ensureProductsSynced(
          shop,
          missingCatalogIds,
        )
      } catch {
        throw new ServiceUnavailableException(
          `Catalog sync is unavailable for products: ${missingCatalogIds.join(', ')}`,
        )
      }

      catalogProducts = await this.prisma.catalogProduct.findMany({
        where: {
          shopId: shop,
          shopifyProductId: { in: ids },
        },
        select: { shopifyProductId: true },
      })
      catalogIds = new Set(
        catalogProducts.map((product) => product.shopifyProductId),
      )
    }

    const unresolvedIds = ids.filter((id) => !catalogIds.has(id))
    if (unresolvedIds.length > 0) {
      throw new ConflictException(
        `Catalog sync is incomplete for products: ${unresolvedIds.join(', ')}`,
      )
    }

    return catalogIds
  }

  async resolveOfferItems(
    gqlClient: GraphqlClient,
    shop: string,
    triggerGroup: ProductGroupInput,
    fallbackGroup?: ProductGroupInput,
  ) {
    const resolveGroup = async (
      group: ProductGroupInput | undefined,
      source: OfferCandidate['source'],
    ): Promise<OfferCandidate[]> => {
      if (!group) return []

      if (
        group.typeId.includes('1') &&
        group.rules.some((rule) => rule.column === 13)
      ) {
        throw new ConflictException(
          'Customer-specific recommendation rules require a customer context and cannot be persisted',
        )
      }

      const explicit = (group.ids ?? []).map((id) => ({
        id: this.normalizeProductId(id),
        source,
      }))
      const evaluated =
        group.rules?.length > 0 && group.typeId?.length > 0
          ? await this.listProductService.getDataByCondition(
              gqlClient,
              100,
              group.typeId,
              this.normalizeConditionRules(group.rules),
            )
          : []

      return [
        ...explicit,
        ...evaluated.map((product) => ({
          id: this.normalizeProductId(product.id),
          source,
        })),
      ]
    }

    const candidates = [
      ...(await resolveGroup(triggerGroup, 'trigger')),
      ...(await resolveGroup(fallbackGroup, 'fallback')),
    ]
    const uniqueCandidates = candidates.filter(
      (candidate, index, all) =>
        candidate.id &&
        all.findIndex((item) => item.id === candidate.id) === index,
    )
    const ids = uniqueCandidates.flatMap((candidate) =>
      candidate.id ? [candidate.id] : [],
    )

    if (ids.length === 0) return []

    const catalogIds = await this.ensureCatalogProducts(shop, ids)

    return uniqueCandidates
      .filter(
        (candidate): candidate is OfferCandidate & { id: string } =>
          candidate.id !== null && catalogIds.has(candidate.id),
      )
      .map((candidate, position) => ({
        shopId: shop,
        shopifyProductId: candidate.id,
        position,
        source: candidate.source,
      }))
  }

  async createData(
    gqlClient: GraphqlClient,
    shop: string,
    dataForm: CreateProductRecommenderDto,
  ) {
    const pageIds = this.normalizePageIds(dataForm.trigger.pageIds)
    const triggerProductGroup = this.normalizeTriggerGroup(
      pageIds,
      dataForm.productGroups,
    )
    const fallbackGroup =
      dataForm.fallback.productGroups.ids.length > 0 ||
      dataForm.fallback.productGroups.rules.length > 0
        ? dataForm.fallback.productGroups
        : undefined
    const offerItems = await this.resolveOfferItems(
      gqlClient,
      shop,
      dataForm.trigger.productGroups,
      fallbackGroup,
    )

    return await this.prisma.$transaction(async (tx) => {
      const createOffer = await tx.offerProduct.create({
        data: {
          shopId: shop,
          name: dataForm.name,
          placeId: +dataForm.placeId,
          triggerProduct: {
            create: {
              pageIds,
              scheduleOn: dataForm.scheduleOn,
              productGroups: {
                create: {
                  typeId: dataForm.trigger.productGroups.typeId,
                  ids: dataForm.trigger.productGroups.ids,

                  ...(dataForm.trigger.productGroups.rules.length > 0
                    ? {
                        rules: {
                          create: dataForm.trigger.productGroups.rules.map(
                            (data: {
                              column: string
                              relation: string
                              value: string[]
                            }) => {
                              return {
                                column: +data.column,
                                relation: +data.relation,
                                value: data.value,
                              }
                            },
                          ),
                        },
                      }
                    : {}),
                },
              },
            },
          },
          productGroups: {
            create: {
              typeId: triggerProductGroup.typeId,
              ids: triggerProductGroup.ids.map(String),
              ...(triggerProductGroup.rules.length > 0
                ? {
                    rules: {
                      create: triggerProductGroup.rules.map(
                        (data: {
                          column: string
                          relation: string
                          value: string[]
                        }) => {
                          return {
                            column: +data.column,
                            relation: +data.relation,
                            value: data.value,
                          }
                        },
                      ),
                    },
                  }
                : {}),
            },
          },
          ...(dataForm.fallback.productGroups.ids.length > 0 ||
          dataForm.fallback.productGroups.rules.length > 0
            ? {
                fallBackProduct: {
                  create: {
                    productGroups: {
                      create: {
                        typeId: dataForm.fallback.productGroups.typeId,
                        ids: dataForm.fallback.productGroups.ids,
                        ...(dataForm.fallback.productGroups.rules.length > 0
                          ? {
                              rules: {
                                create:
                                  dataForm.fallback.productGroups.rules.map(
                                    (data: {
                                      column: string
                                      relation: string
                                      value: string[]
                                    }) => ({
                                      column: +data.column,
                                      relation: +data.relation,
                                      value: data.value,
                                    }),
                                  ),
                              },
                            }
                          : {}),
                      },
                    },
                  },
                },
              }
            : {}),
        },
      })

      if (offerItems.length > 0) {
        await tx.offerProductItem.createMany({
          data: offerItems.map((item) => ({
            ...item,
            offerProductId: createOffer.id,
          })),
        })
      }

      return createOffer
    })
  }

  async updateData(
    gqlClient: GraphqlClient,
    shop: string,
    dataForm: UpdateProductRecommenderDto,
  ) {
    const offer = await this.prisma.offerProduct.findFirst({
      where: { id: +dataForm.id, shopId: shop },
      select: {
        id: true,
        fallBackProduct: {
          select: { id: true },
        },
      },
    })
    if (!offer) {
      throw new NotFoundException(
        `OfferProduct with id ${dataForm.id} not found`,
      )
    }

    const pageIds = this.normalizePageIds(dataForm.trigger.pageIds)
    const triggerProductGroup = this.normalizeTriggerGroup(
      pageIds,
      dataForm.productGroups,
    )
    const fallbackGroup =
      dataForm.fallback.productGroups.ids.length > 0 ||
      dataForm.fallback.productGroups.rules.length > 0
        ? dataForm.fallback.productGroups
        : undefined
    const offerItems = await this.resolveOfferItems(
      gqlClient,
      shop,
      dataForm.trigger.productGroups,
      fallbackGroup,
    )

    const currentTriggerProductGroupsRules = await this.prisma.rules.findMany({
      where: {
        productGroupsId: +dataForm.trigger.productGroups.id,
      },
    })

    const currentFallBackProductGroupsRules = await this.prisma.rules.findMany({
      where: {
        productGroupsId: +dataForm.fallback.productGroups.id,
      },
    })
    const newRuleTriggerIds = dataForm.trigger.productGroups.rules.map(
      (rule) => +rule.id,
    )

    const newFallbackRules = dataForm.fallback.productGroups.rules.map(
      (rule) => +rule.id,
    )
    const rulesTriggerToDelete = currentTriggerProductGroupsRules.filter(
      (rule) => !newRuleTriggerIds.includes(rule.id),
    )

    const rulesFallbackToDelete = currentFallBackProductGroupsRules.filter(
      (rule) => !newFallbackRules.includes(rule.id),
    )
    const currentProductGroupsRules = await this.prisma.rules.findMany({
      where: {
        productGroupsId: +dataForm.productGroups.id,
      },
    })
    const newRuleIds = triggerProductGroup.rules.map((rule) => +rule.id)

    const rulesToDelete = currentProductGroupsRules.filter(
      (rule) => !newRuleIds.includes(rule.id),
    )

    return await this.prisma.$transaction(async (tx) => {
      const updateData = await tx.offerProduct.update({
        where: {
          id: +dataForm.id,
        },
        data: {
          name: dataForm.name,
          placeId: +dataForm.placeId,
          triggerProduct: {
            update: {
              where: {
                id: +dataForm.trigger.id,
              },
              data: {
                pageIds,
                scheduleOn: dataForm.scheduleOn,
                productGroups: {
                  update: {
                    where: {
                      id: +dataForm.trigger.productGroups.id,
                    },
                    data: {
                      typeId: dataForm.trigger.productGroups.typeId,
                      ids: dataForm.trigger.productGroups.ids,
                      rules: {
                        upsert: dataForm.trigger.productGroups.rules.map(
                          (data: {
                            id: string
                            column: string
                            relation: string
                            value: string[]
                          }) => ({
                            where: { id: +data.id },
                            create: {
                              column: +data.column,
                              relation: +data.relation,
                              value: data.value,
                            },
                            update: {
                              column: +data.column,
                              relation: +data.relation,
                              value: data.value,
                            },
                          }),
                        ),
                        deleteMany: {
                          productGroupsId: +dataForm.trigger.productGroups.id,
                          id: {
                            in: rulesTriggerToDelete.map((rule) => rule.id),
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          ...(dataForm.fallback.productGroups.ids.length > 0 ||
          dataForm.fallback.productGroups.rules.length > 0
            ? {
                fallBackProduct: {
                  upsert: {
                    where: {
                      id: +dataForm.fallback.id || 0,
                    },
                    create: {
                      productGroups: {
                        create: {
                          typeId: dataForm.fallback.productGroups.typeId,
                          ids: dataForm.fallback.productGroups.ids,
                          rules: {
                            create: dataForm.fallback.productGroups.rules.map(
                              (data) => {
                                return {
                                  column: +data.column,
                                  relation: +data.relation,
                                  value: data.value,
                                }
                              },
                            ),
                          },
                        },
                      },
                    },
                    update: {
                      productGroups: {
                        update: {
                          where: {
                            id: +dataForm.fallback.productGroups.id,
                          },
                          data: {
                            typeId: dataForm.fallback.productGroups.typeId,
                            ids: dataForm.fallback.productGroups.ids,
                            rules: {
                              upsert: dataForm.fallback.productGroups.rules.map(
                                (data) => ({
                                  where: { id: +data.id },
                                  create: {
                                    column: +data.column,
                                    relation: +data.relation,
                                    value: data.value,
                                  },
                                  update: {
                                    column: +data.column,
                                    relation: +data.relation,
                                    value: data.value,
                                  },
                                }),
                              ),
                              deleteMany: {
                                productGroupsId:
                                  +dataForm.fallback.productGroups.id,
                                id: {
                                  in: rulesFallbackToDelete.map(
                                    (rule) => rule.id,
                                  ),
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              }
            : offer.fallBackProduct
              ? { fallBackProduct: { delete: true } }
              : {}),
          productGroups: {
            update: {
              where: {
                id: +dataForm.productGroups.id,
              },
              data: {
                typeId: triggerProductGroup.typeId,
                ids: triggerProductGroup.ids.map(String),
                rules: {
                  upsert: triggerProductGroup.rules.map(
                    (data: {
                      id: string
                      column: string
                      relation: string
                      value: string[]
                    }) => ({
                      where: { id: +data.id },
                      create: {
                        column: +data.column,
                        relation: +data.relation,
                        value: data.value,
                      },
                      update: {
                        column: +data.column,
                        relation: +data.relation,
                        value: data.value,
                      },
                    }),
                  ),
                  deleteMany: {
                    productGroupsId: +dataForm.productGroups.id,
                    id: {
                      in: rulesToDelete.map((rule) => rule.id),
                    },
                  },
                },
              },
            },
          },
        },
        // include: {
        //   productGroups: {
        //     include: {
        //       rules: true,
        //     },
        //   },
        //   triggerProduct: {
        //     include: {
        //       productGroups: {
        //         include: {
        //           rules: true,
        //         },
        //       },
        //     },
        //   },
        //   fallBackProduct: {
        //     include: {
        //       productGroups: {
        //         include: {
        //           rules: true,
        //         },
        //       },
        //     },
        //   },
        // },
      })

      await tx.offerProductItem.deleteMany({
        where: { offerProductId: updateData.id, shopId: shop },
      })
      if (offerItems.length > 0) {
        await tx.offerProductItem.createMany({
          data: offerItems.map((item) => ({
            ...item,
            offerProductId: updateData.id,
          })),
        })
      }

      return updateData
    })
  }

  async getData(shop: string, query: GetDetail) {
    const offers = await this.prisma.offerProduct.findMany({
      where: {
        shopId: shop,
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
        items: {
          where: { shopId: shop },
          include: {
            catalogProduct: true,
          },
          orderBy: { position: 'asc' },
        },
      },
    })

    return offers.map((offer) => this.withProducts(offer))
  }

  async getFirstData(shop: string, query: RecommendDto) {
    const offer = await this.prisma.offerProduct.findFirst({
      where: {
        shopId: shop,
        id: +query.id || undefined,
      },
      include: {
        items: {
          where: { shopId: shop },
          include: {
            catalogProduct: true,
          },
          orderBy: { position: 'asc' },
        },
      },
    })

    return offer ? this.withProducts(offer) : null
  }

  private withProducts(offer: any) {
    const { items, ...rest } = offer
    return {
      ...rest,
      products: (items ?? []).map((item) => {
        const product = item.catalogProduct
        return {
          id: product.shopifyProductId,
          url:
            product.onlineStoreUrl ||
            (product.handle
              ? `https://${product.shopId}/products/${product.handle}`
              : null),
          avatarSource: product.featuredImageUrl,
          name: product.title,
          handle: product.handle,
          status: product.status,
          price: product.minPrice,
        }
      }),
    }
  }

  async getNameCategory(gqlClient, value: string[]) {
    const data = await gqlClient.query({
      data: `{
        collections(
          first: 10
          query: "${value.map((id) => `id:${id}`).join(' OR ')}"
        ) {
          edges {
            node {
              title
            }
          }
        }
      }`,
    })

    const titlesArray = data.body.data.collections.edges.map(
      (edge) => edge.node.title,
    )

    return titlesArray
  }

  async getListProduct(gqlClient: GraphqlClient, listIds: string[]) {
    let allProducts = []
    let hasNextPage = true
    let endCursor = null
    try {
      const productIdQuery = listIds
        .map((listId) => `id:${listId}`)
        .join(' OR ')

      while (hasNextPage) {
        const result = await gqlClient.query<any>({
          data: `{
            products(first: ${MAX_QUERY_NUMBER}${endCursor ? `, after: "${endCursor}"` : ''}${productIdQuery ? `, query: "${productIdQuery}"` : ''}) {
              edges {
                node {
                  id
                  title
                  status
                  media(first: 1) {
                    edges {
                      node {
                        preview {
                          image {
                            url
                          }
                        }
                      }
                    }
                  }
                  onlineStorePreviewUrl
                  priceRangeV2 {
                    maxVariantPrice {
                      amount
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }`,
        })

        if (!result || !result.body || !result.body.data) {
          throw new Error('Failed to fetch collections')
        }

        const products = result.body.data.products.edges.map((edge) => {
          return {
            id: edge.node.id,
            url: edge.node.onlineStorePreviewUrl,
            avatarSource: edge.node.media.edges[0].node.preview.image.url,
            name: edge.node.title,
            status: edge.node.status,
          }
        })

        allProducts = allProducts.concat(products)

        hasNextPage = result.body.data.products.pageInfo.hasNextPage
        endCursor = result.body.data.products.pageInfo.endCursor
      }
      return allProducts
    } catch (error) {
      console.error('Error fetching products:', error)
      return []
    }
  }
}
