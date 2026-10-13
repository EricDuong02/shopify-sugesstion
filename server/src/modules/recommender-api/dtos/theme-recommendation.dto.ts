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
  id: string

  @IsString()
  @IsIn(storefrontPageTypes)
  pageType: PageType

  @IsString()
  @IsOptional()
  limit?: string
}
