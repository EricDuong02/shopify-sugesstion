import { Type } from 'class-transformer'
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator'

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
  ids: string[]

  @IsNumber()
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

  @IsNumber()
  placeId: string

  @ValidateNested()
  @Type(() => ProductGroupsDto)
  productGroups: ProductGroupsDto

  @ValidateNested()
  @Type(() => TriggerDto)
  trigger: TriggerDto

  @ValidateNested()
  @Type(() => Fallback)
  fallback: Fallback

  @IsString()
  scheduleOn: boolean
}
