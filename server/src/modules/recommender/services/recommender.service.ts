import { DATA_PER_PAGE, MAX_QUERY_NUMBER } from '@/const/utils'
import { FetchBrandsResponse, FetchCategoryResponse } from '@/types/Recommend'
import { Injectable } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { GraphqlClient } from '@shopify/shopify-api'
import { CreateProductRecommenderDto } from '../dtos/create-product-recommender.dto'
import { GetDetail } from '../dtos/get-detail.dto'
import { RecommendDto } from '../dtos/recommends.dto'
import { UpdateProductRecommenderDto } from '../dtos/update-product-recommender.dto'

@Injectable()
export class RecommenderService {
  prisma: PrismaClient
  constructor() {
    this.prisma = new PrismaClient()
  }

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

  async createData(
    gqlClient: GraphqlClient,
    dataForm: CreateProductRecommenderDto,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      const createOffer = await tx.offerProduct.create({
        data: {
          name: dataForm.name,
          placeId: +dataForm.placeId,
          triggerProduct: {
            create: {
              pageIds: dataForm.trigger.pageIds.map(Number),
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
              typeId: dataForm.productGroups.typeId,
              ids: dataForm.productGroups.ids,
              ...(dataForm.productGroups.rules.length > 0
                ? {
                    rules: {
                      create: dataForm.productGroups.rules.map(
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
          ...(dataForm.fallback.productGroups.typeId.length > 0 &&
          dataForm.trigger.productGroups.rules.length > 0
            ? {
                fallBackProduct: {
                  create: {
                    productGroups: {
                      create: {
                        typeId: dataForm.trigger.productGroups.typeId,
                        ids: dataForm.trigger.productGroups.ids,
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
                      },
                    },
                  },
                },
              }
            : {}),
        },
      })

      return createOffer
    })
  }

  async updateData(
    gqlClient: GraphqlClient,
    dataForm: UpdateProductRecommenderDto,
  ) {
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
    const newRuleIds = dataForm.productGroups.rules.map((rule) => +rule.id)

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
                pageIds: dataForm.trigger.pageIds.map(Number),
                scheduleOn: dataForm.scheduleOn,
                productGroups: {
                  update: {
                    where: {
                      id: +dataForm.trigger.productGroups.id,
                    },
                    data: {
                      typeId: dataForm.trigger.productGroups.typeId,
                      ids: dataForm.trigger.productGroups.ids,
                      ...(dataForm.trigger.productGroups.rules.length > 0
                        ? {
                            rules: {
                              upsert: dataForm.trigger.productGroups.rules.map(
                                (data: {
                                  id: string
                                  column: string
                                  relation: string
                                  value: string[]
                                }) => {
                                  return {
                                    where: {
                                      id: +data.id,
                                    },
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
                                  }
                                },
                              ),
                              deleteMany: {
                                productGroupsId:
                                  +dataForm.trigger.productGroups.id,
                                id: {
                                  in: rulesTriggerToDelete.map(
                                    (rule) => rule.id,
                                  ),
                                },
                              },
                            },
                          }
                        : {}),
                    },
                  },
                },
              },
            },
          },
          ...(dataForm.fallback.productGroups.typeId.length > 0 &&
          dataForm.trigger.productGroups.rules.length > 0
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
                                (data) => {
                                  return {
                                    where: {
                                      id: +data.id,
                                    },
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
                                  }
                                },
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
            : {}),
          productGroups: {
            update: {
              where: {
                id: +dataForm.productGroups.id,
              },
              data: {
                typeId: dataForm.productGroups.typeId,
                ids: dataForm.productGroups.ids,
                ...(dataForm.productGroups.rules.length > 0
                  ? {
                      rules: {
                        upsert: dataForm.productGroups.rules.map(
                          (data: {
                            id: string
                            column: string
                            relation: string
                            value: string[]
                          }) => {
                            return {
                              where: {
                                id: +data.id,
                              },
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
                            }
                          },
                        ),
                        deleteMany: {
                          productGroupsId: +dataForm.trigger.productGroups.id,
                          id: {
                            in: rulesToDelete.map((rule) => rule.id),
                          },
                        },
                      },
                    }
                  : {}),
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

      // const productGroups = updateData.triggerProduct.productGroups[0]
      // const typeId = productGroups.typeId
      // const rules = productGroups.rules
      // const listDataTrigger = await this.listProductService.getDataByCondition(
      //   gqlClient,
      //   100,
      //   typeId,
      //   rules,
      // )

      // const fallbackProductGroups = updateData.fallBackProduct
      //   ? updateData.fallBackProduct.productGroups[0]
      //   : null
      // const listDataFallback = fallbackProductGroups
      //   ? await this.listProductService.getDataByCondition(
      //       gqlClient,
      //       100,
      //       fallbackProductGroups.typeId,
      //       fallbackProductGroups.rules,
      //     )
      //   : []

      // const mergedData = this.listProductService.mergeLists(
      //   listDataTrigger,
      //   listDataFallback,
      // )

      // if (mergedData.length > 0) {
      //   await tx.offerProduct.update({
      //     where: {
      //       id: updateData.id,
      //     },
      //     data: {
      //       listProduct: {
      //         deleteMany: {
      //           offerProductId: updateData.id,
      //         },
      //         upsert: mergedData.map((data) => ({
      //           where: {
      //             idProduct_offerProductId: {
      //               idProduct: data.id,
      //               offerProductId: updateData.id,
      //             },
      //           },
      //           create: {
      //             idProduct: data.id,
      //             url: data.url,
      //             avatarSource: data.avatarSource,
      //             name: data.name,
      //             status: data.status,
      //             price: data.price,
      //             handle: data.handle,
      //           },
      //           update: {
      //             idProduct: data.id,
      //             url: data.url,
      //             avatarSource: data.avatarSource,
      //             name: data.name,
      //             status: data.status,
      //             price: data.price,
      //             handle: data.handle,
      //           },
      //         })),
      //       },
      //     },
      //   })
      // }

      return updateData
    })
  }

  async getData(query: GetDetail) {
    return await this.prisma.offerProduct.findMany({
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
        listProduct: true,
      },
    })
  }

  async getFirstData(query: RecommendDto) {
    return await this.prisma.offerProduct.findFirst({
      where: {
        id: +query.id || undefined,
      },
      include: {
        listProduct: true,
      },
    })
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
