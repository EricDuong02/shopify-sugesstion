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
