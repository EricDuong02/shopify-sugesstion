import { IsString } from 'class-validator'

export class GetDetail {
  @IsString()
  id: string
}
