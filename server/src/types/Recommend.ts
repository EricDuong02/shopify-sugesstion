import { Status } from '@prisma/client'

export type ShopifyOrdersQueryResponse = {
  orders: {
    edges: Array<{
      node: {
        lineItems: {
          edges: Array<{
            node: {
              title: string
              quantity: number
              originalUnitPriceSet: {
                shopMoney: {
                  amount: string
                  currencyCode: string
                }
              }
              product: ProductGql
            }
          }>
        }
      }
    }>
    pageInfo: {
      hasNextPage: boolean
      endCursor: string
    }
  }
}

export type ShopifyOrdersQueryWithDateResponse = {
  orders: {
    edges: Array<{
      node: {
        lineItems: {
          edges: Array<{
            node: {
              product: ProductGql
            }
          }>
        }
      }
    }>
    pageInfo: {
      hasNextPage: boolean
      endCursor: string
    }
  }
}

export type ProductInCollectionsResponse = {
  collections: {
    edges: Array<{
      node: {
        id: string
        title: string
        handle: string
        products: {
          edges: [
            {
              node: ProductGql
            },
          ]
          pageInfo: {
            hasNextPage: boolean
            endCursor: string
          }
        }
      }
    }>
  }
}

export type ProductInCollectionResponse = {
  collection: {
    products: {
      edges: Array<{
        node: ProductGql
      }>
      pageInfo: {
        hasNextPage: boolean
        endCursor: string
      }
    }
  }
}

export type DataProductResponse = {
  products: {
    edges: [
      {
        node: ProductGql
      },
    ]
    pageInfo: {
      hasNextPage: boolean
      endCursor: string
    }
  }
}

export type DataProductResponseWithPrice = {
  products: {
    edges: [
      {
        node: {
          id: string
          title: string
          handle: string
          status: Status
          media: {
            edges: {
              node: {
                preview: {
                  image: {
                    url: string
                  }
                }
              }
            }[]
          }
          onlineStorePreviewUrl: string | null
          priceRangeV2: {
            maxVariantPrice: {
              amount: string
            }
          }
          compareAtPriceRange: {
            maxVariantCompareAtPrice: {
              amount: string
            }
          }
        }
      },
    ]
    pageInfo: {
      hasNextPage: boolean
      endCursor: string
    }
  }
}

export type Product = {
  id: string
  url: string
  avatarSource: string
  name: string
  handle: string
  status: Status
  price: number
}

export type ProductGql = {
  id: string
  title: string
  handle: string
  status: Status
  media: {
    edges: {
      node: {
        preview: {
          image: {
            url: string
          }
        }
      }
    }[]
  }
  onlineStorePreviewUrl: string | null
  priceRangeV2: {
    maxVariantPrice: {
      amount: string
    }
  }
}
type LineItem = {
  title: string
  quantity: number
  variant: {
    product: ProductGql
  }
}

type Order = {
  id: string
  name: string
  lineItems: {
    edges: {
      node: LineItem
    }[]
    pageInfo: {
      hasNextPage: boolean
      endCursor: string
    }
  }
}

export type OrdersData = {
  data: {
    orders: {
      edges: {
        node: Order
      }[]
      pageInfo: {
        hasNextPage: boolean
        endCursor: string
      }
    }
  }
}

export type DiscountQueryResponse = {
  discountNodes: {
    nodes: {
      discount: {
        title?: string
        endsAt?: string
        customerBuys?: {
          items: {
            products?: {
              edges: [
                {
                  node: ProductGql
                },
              ]
              pageInfo: {
                hasNextPage: boolean
                endCursor?: string
              }
            }
          } & {
            collections?: {
              edges: Array<{
                node: {
                  products: {
                    edges: [
                      {
                        node: ProductGql
                      },
                    ]
                    pageInfo: {
                      hasNextPage: boolean
                      endCursor?: string
                    }
                  }
                }
              }>
              pageInfo: {
                hasNextPage: boolean
                endCursor?: string
              }
            }
          }
        }
      }
    }[]
    pageInfo: {
      hasNextPage: boolean
      endCursor?: string
    }
  }
}

export type FetchBrandsResponse = {
  products: {
    edges: {
      node: {
        vendor: string
      }
      cursor: string
    }[]
    pageInfo: {
      hasNextPage: boolean
    }
  }
}

export type FetchCategoryResponse = {
  collections: {
    edges: {
      node: {
        id: string
        title: string
      }
    }[]
    pageInfo: {
      hasNextPage: boolean
      endCursor?: string
    }
  }
}
