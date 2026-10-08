import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac, timingSafeEqual } from 'crypto'
import { PrismaService } from '@/shared/services/prisma.service'

interface SessionTokenPayload {
  iss?: string
  dest?: string
  aud?: string
  sub?: string
  exp?: number
  nbf?: number
  iat?: number
  jti?: string
  sid?: string
}

/**
 * Guard for /api/v1/chat-admin/* endpoints.
 *
 * Auth strategy: verify the Shopify App Bridge session token sent in the
 * `Authorization: Bearer <token>` header. The token is a JWT signed with
 * HMAC-SHA256 using SHOPIFY_API_SECRET. The shop is taken from the
 * verified `dest` claim, never from a query parameter, so a caller
 * cannot read another shop's configuration by editing `?shop=`.
 *
 * If SHOPIFY_API_SECRET is not available (e.g. a bare unit test run),
 * the guard falls back to checking that a session row exists for the
 * requested shop. That fallback is NOT authentication and logs a
 * warning.
 *
 * Scope note: this authenticates the *shop*, not an individual user.
 * Anyone who can open the embedded admin app for the shop can read that
 * shop's chat configuration. Restricting to specific staff roles is a
 * product decision and is not implemented here.
 *
 * The public chat endpoints (/api/v1/chat) must NOT use this guard:
 * storefront visitors have no Shopify session.
 */
@Injectable()
export class ShopAuthGuard implements CanActivate {
  private readonly logger = new Logger(ShopAuthGuard.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const token = this.extractToken(req)

    if (!token) {
      throw new UnauthorizedException(
        'Missing session token. Send Authorization: Bearer <session token>.',
      )
    }

    const secret =
      this.configService.get<string>('SHOPIFY_API_SECRET') ||
      process.env.SHOPIFY_API_SECRET

    if (!secret) {
      return this.insecureFallback(req)
    }

    const payload = this.verifyToken(token, secret)
    const shop = this.shopFromDest(payload.dest as string)

    // The verified shop must actually have a stored session.
    const row = await this.prisma.appSession.findFirst({ where: { shop } })
    if (!row) {
      throw new UnauthorizedException(
        `No session found for shop ${shop}. Please reinstall the app.`,
      )
    }

    req.verifiedShop = shop
    req.verifiedPayload = payload
    return true
  }

  private extractToken(req: any): string | null {
    const auth: unknown = req.headers?.authorization
    if (!auth || typeof auth !== 'string') return null
    const parts = auth.split(' ')
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null
    const token = parts[1].trim()
    return token || null
  }

  private verifyToken(token: string, secret: string): SessionTokenPayload {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid session token format')
    }
    const [headerB64, payloadB64, signatureB64] = parts

    const expected = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url')

    const sigBuf = Buffer.from(signatureB64, 'base64url')
    const expBuf = Buffer.from(expected, 'base64url')
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid session token signature')
    }

    let payload: SessionTokenPayload
    try {
      const json = Buffer.from(payloadB64, 'base64url').toString('utf8')
      payload = JSON.parse(json) as SessionTokenPayload
    } catch {
      throw new UnauthorizedException('Invalid session token payload')
    }

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      throw new UnauthorizedException('Session token expired')
    }
    if (payload.nbf && payload.nbf > now) {
      throw new UnauthorizedException('Session token not yet valid')
    }
    if (!payload.dest || typeof payload.dest !== 'string') {
      throw new UnauthorizedException('Session token missing dest claim')
    }

    return payload
  }

  private shopFromDest(dest: string): string {
    let hostname: string
    try {
      hostname = new URL(dest).hostname.toLowerCase()
    } catch {
      throw new UnauthorizedException(`Invalid dest claim: ${dest}`)
    }
    if (!hostname.endsWith('.myshopify.com')) {
      throw new UnauthorizedException(`Invalid dest claim: ${dest}`)
    }
    return hostname
  }

  /**
   * INSECURE fallback used only when SHOPIFY_API_SECRET is unavailable.
   * Only checks that a session row exists for the shop named in the
   * request. AppSession has columns (id, shop, payload Json); the access
   * token and expiry live inside payload, not as columns.
   */
  private async insecureFallback(req: any): Promise<boolean> {
    const shop = this.shopFromRequest(req)
    if (!shop) {
      throw new UnauthorizedException(
        'Missing shop identifier and no SHOPIFY_API_SECRET to verify the token.',
      )
    }

    const row = await this.prisma.appSession.findFirst({ where: { shop } })
    if (!row) {
      throw new UnauthorizedException(
        `No session found for shop ${shop}. Please reinstall the app.`,
      )
    }

    const payload = row.payload as { accessToken?: string } | null
    if (!payload?.accessToken) {
      throw new UnauthorizedException(
        `Session for shop ${shop} has no access token.`,
      )
    }

    this.logger.warn(
      `Insecure fallback auth used for shop ${shop}. ` +
        `Set SHOPIFY_API_SECRET to enable session token verification.`,
    )
    req.verifiedShop = shop
    return true
  }

  private shopFromRequest(req: any): string | null {
    const q: unknown = req.query?.shop
    if (q && typeof q === 'string' && q.trim()) {
      return q.toLowerCase().trim()
    }
    const h: unknown =
      req.headers?.['x-shop-domain'] || req.headers?.['x-shopify-shop-domain']
    if (h && typeof h === 'string' && h.trim()) {
      return h.toLowerCase().trim()
    }
    return null
  }
}
