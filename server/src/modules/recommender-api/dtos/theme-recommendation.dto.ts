import { PageType } from '@/types/RecommendApi'
import { IsIn, IsOptional, IsString, Matches } from 'class-validator'

const storefrontPageTypes = [
  PageType.home,
  PageType.cart,
  PageType.collection,
  PageType.product,
]

export class ThemeRecommendationDto {
  @IsString()
  @Matches(/^[1-9]\d*$/)
  @IsOptional()
  id?: string

  @IsString()
  @IsIn(storefrontPageTypes)
  pageType: PageType

  @IsString()
  @IsOptional()
  limit?: string

  @IsString()
  @Matches(/^[1-9]\d*$/)
  @IsOptional()
  productLimit?: string

  @IsString()
  @IsOptional()
  shop?: string

  @IsString()
  @IsOptional()
  timestamp?: string

  @IsString()
  @IsOptional()
  signature?: string

  @IsString()
  @IsOptional()
  path_prefix?: string

  @IsString()
  @IsOptional()
  logged_in_customer_id?: string
}
