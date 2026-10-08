import { createParamDecorator, ExecutionContext } from '@nestjs/common'

/**
 * Injects the shop domain verified by ShopAuthGuard.
 *
 * Use only in controllers protected by `@UseGuards(ShopAuthGuard)`.
 * Unlike `ShopSession`, which reads `response.locals.shopify.session`,
 * this returns the shop proven by the session token signature and
 * therefore cannot be spoofed with a query parameter.
 */
export const VerifiedShop = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest()
    return req.verifiedShop as string
  },
)
