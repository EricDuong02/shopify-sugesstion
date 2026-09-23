import { Body, Controller, Post } from '@nestjs/common'
import { TokenService } from '../services/token.service'
import { UpsertToken } from '../dtos/upsert-token.dto'

@Controller({
  path: 'token',
  version: '1',
})
export class TokenController {
  constructor(private readonly productService: TokenService) {}
  @Post('upsert')
  async upsertToken(@Body() body: UpsertToken) {
    const data = await this.productService.upsertToken(body)
    return data
  }
}
