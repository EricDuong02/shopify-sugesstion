import { Type } from 'class-transformer'
import { TRIGGER_PAGE_IDS } from '@/data'
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
  column: string

  @IsString()
  relation: string

  @IsArray()
  @IsString({ each: true })
  value: string[]
}

class ProductGroupsDto {
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
  @IsArray()
  @IsString({ each: true })
  @IsIn(TRIGGER_PAGE_IDS, { each: true })
  pageIds: string[]

  @ValidateNested()
  @Type(() => ProductGroupsDto)
  productGroups: ProductGroupsDto
}

class Fallback {
  @ValidateNested()
  @Type(() => ProductGroupsDto)
  productGroups: ProductGroupsDto
}

export class CreateProductRecommenderDto {
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
