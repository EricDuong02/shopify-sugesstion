import { TRIGGER_PAGE_IDS } from '@/data'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  ValidateNested,
} from 'class-validator'

class RuleDto {
  @IsString()
  id: string

  @IsString()
  column: string

  @IsString()
  relation: string

  @IsArray()
  @IsString({ each: true })
  value: string[]
}

class ProductGroupsDto {
  @IsString()
  id: string

  @IsArray()
  @IsString({ each: true })
  ids: string[]

  @IsArray()
  @IsString({ each: true })
  typeId: string[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules: RuleDto[]
}

class TriggerDto {
  @IsString()
  id: string

  @IsArray()
  @IsString({ each: true })
  @IsIn(TRIGGER_PAGE_IDS, { each: true })
  pageIds: string[]

  @ValidateNested()
  @Type(() => ProductGroupsDto)
  productGroups: ProductGroupsDto
}
class Fallback {
  @IsString()
  id: string

  @ValidateNested()
  @Type(() => ProductGroupsDto)
  productGroups: ProductGroupsDto
}

export class UpdateProductRecommenderDto {
  @IsString()
  id: string

  @IsString()
  name: string

  @IsInt()
  placeId: number

  @ValidateNested()
  @Type(() => ProductGroupsDto)
  productGroups: ProductGroupsDto

  @ValidateNested()
  @Type(() => TriggerDto)
  trigger: TriggerDto

  @ValidateNested()
  @Type(() => Fallback)
  fallback: Fallback

  @IsBoolean()
  scheduleOn: boolean
}
