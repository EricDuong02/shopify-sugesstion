import { IsString } from 'class-validator'

export class UpsertToken {
  @IsString()
  token: string
}
