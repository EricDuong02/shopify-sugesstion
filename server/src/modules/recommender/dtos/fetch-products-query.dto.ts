import { IsOptional, IsString } from 'class-validator'

export class FetchProductsQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  afterCursor?: string
}
