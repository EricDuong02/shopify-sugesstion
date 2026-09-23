import { PageType } from '@/types/RecommendApi'
import { IsOptional, IsString } from 'class-validator'

export class RecommendDto {
  @IsString()
  id: string

  @IsString()
  @IsOptional()
  limit: string

  @IsString()
  @IsOptional()
  customerId: string
}
export class RecommendListDto {
  @IsString()
  pageType: PageType

  @IsString()
  limit: string

  @IsString()
  @IsOptional()
  search?: string

  @IsString()
  @IsOptional()
  ids?: string
}
