export type TypeDataCategory = {
  id: string
  title: string
}[]

export type Rule = {
  id: string
  column: string
  relation: string
  value: string[]
}

type RuleDefault = {
  id: number
  column: number
  relation: number
  value: string[]
  productGroupsId: number | null
  updatedAt: Date
  createdAt: Date
}

type ProductGroup = {
  id: number
  typeId: string[]
  rules: RuleDefault[]
  ids: string[]
  offerProductId: number | null
  triggerProductId: number | null
  fallBackProductId: number | null
  updatedAt: Date
  createdAt: Date
}

type TriggerProduct = {
  id: number
  pageIds: number[]
  productGroups: ProductGroup[]
  scheduleOn: boolean
  offerProductId: number
  updatedAt: Date
  createdAt: Date
}

type FallBackProduct = {
  id: number
  productGroups: ProductGroup[]
  offerProductId: number
  updatedAt: Date
  createdAt: Date
}

export type OfferProduct = {
  id: number
  name: string
  placeId: number
  productGroups: ProductGroup[]
  triggerProduct: TriggerProduct | null
  fallBackProduct: FallBackProduct | null
}

export type GetDataResult = OfferProduct[]

export type RecommendedProduct = {
  id: string
  url: string | null
  avatarSource: string | null
  name: string
  handle: string | null
  status: string | null
  price: number | null
}

export enum PageType {
  home = 'home',
  collection = 'collection',
  product = 'product',
  cart = 'cart',
  blog_post = 'blog_post',
  regular = 'regular',
  search = 'search',
}
