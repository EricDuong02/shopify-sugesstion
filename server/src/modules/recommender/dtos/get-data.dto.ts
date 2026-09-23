import { IsOptional, IsString } from 'class-validator'

export class GetData {
  @IsOptional()
  @IsString()
  id: string
}
