import { join } from 'path'
import { readFileSync } from 'fs'
import * as express from 'express'
import { Request, Response, NextFunction } from 'express'
import * as serveStatic from 'serve-static'
import * as cors from 'cors'

import shopify from './lib/shopify-app.js'
import bootstrap from './nest-main.js'
import setupSwagger from './lib/setup-swagger.js'
import { CatalogSyncService } from './modules/catalog/services/catalog-sync.service.js'
import { PrismaService } from './shared/services/prisma.service.js'
import { ShopifyService } from './shared/services/shopify.service.js'
import { configureShopifyServerDecorator } from './decorators/shop-server.decorator.js'
import { sessionStorage } from './lib/shopify-app.js'

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || '3000',
  10,
)

const isProd = process.env.NODE_ENV === 'production'

const STATIC_PATH = join(
  __dirname,
  '..',
  '..',
  'client',
  `${isProd ? 'dist' : 'src'}`,
)

/**
 * Utility function to bypass middleware for a specific path
 * @param path
 * @param middleware
 * @returns
 */

const unless = function (paths: string[], middleware) {
  return function (req: Request, res: Response, next: NextFunction) {
    const isExcluded = paths.some((path) => req.originalUrl.startsWith(path))
    if (isExcluded) {
      return next()
    } else {
      return middleware(req, res, next)
    }
  }
}

async function main() {
  const app = express()

  // Answer CORS preflight at the raw Express level, before any Shopify
  // middleware. The embedded admin iframe (origin admin.shopify.com) and
  // the storefront widget (origin *.myshopify.com) both send non-simple
  // requests, so the browser issues an OPTIONS probe first. With
  // `origin: true` the cors package skips writing Access-Control-Allow-Origin
  // whenever it decides the origin is not allowed, which produced a failed
  // preflight; `origin: '*'` always writes the header.
  // An OPTIONS request only receives headers and ends here. Real requests
  // still pass through validateAuthenticatedSession and the route guards.
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }),
  )

  // Set up Shopify authentication. The callback route is registered after
  // Nest boots so it can enqueue the initial catalog sync through DI.
  app.get(shopify.config.auth.path, shopify.auth.begin())

  // For webhooks, see webhook.controller.ts

  // If you are adding routes outside of the /api path, remember to
  // also add a proxy rule for them in web/frontend/vite.config.js

  const nestApp = await bootstrap(app)
  const prisma = nestApp.get(PrismaService)
  sessionStorage.setPrisma(prisma)
  configureShopifyServerDecorator(nestApp.get(ShopifyService))
  const catalogSync = nestApp.get(CatalogSyncService)

  app.get(
    shopify.config.auth.callbackPath,
    shopify.auth.callback(),
    async (req: Request, res: Response, next: NextFunction) => {
      const shop = res.locals?.shopify?.session?.shop
      if (shop) {
        try {
          await catalogSync.enqueueInitialCatalogResync(shop)
        } catch (error) {
          console.error(
            `[auth] failed to enqueue initial catalog sync for ${shop}:`,
            error,
          )
        }
      }
      next()
    },
    shopify.redirectToShopifyOrAppRoot(),
  )

  nestApp.use(
    '/api/*',
    unless(
      [
        '/api/webhooks',
        '/api/v1/recommender-api',
        // Storefront chat widget: visitors are not Shopify-authenticated.
        // Access is guarded by the per-shop public token inside ChatService.
        '/api/v1/chat',
        // Admin chat endpoints: the shop is resolved from @ShopSession().
        '/api/v1/chat-admin',
      ],
      shopify.validateAuthenticatedSession(),
    ),
  )

  nestApp
    .use('/api/webhooks', express.text({ type: '*/*' }))
    // The storefront widget posts text/plain so the browser skips the
    // CORS preflight probe. `shopify app dev` runs a proxy that answers
    // OPTIONS itself without the CORS headers, which broke the widget in
    // development. Parse the body as text here; the controller decodes it.
    .use('/api/v1/chat/messages/stream', express.text({ type: '*/*' }))
    .use(express.json({ limit: '50mb' }))

  nestApp.use(shopify.cspHeaders())
  nestApp.use(serveStatic(STATIC_PATH, { index: false }))

  setupSwagger(nestApp, shopify)

  nestApp.use(async (req: Request, res: Response, next: NextFunction) => {
    const url = req.originalUrl
    if (url.startsWith('/api')) {
      console.log(`Bypassing API ${url} in static index middleware`)
      return next()
    }

    const customNextFn = () => {
      console.log('Serving index.html')
      return res
        .status(200)
        .set('Content-Type', 'text/html')
        .send(readFileSync(join(STATIC_PATH, 'index.html')))
    }

    return shopify.ensureInstalledOnShop()(req, res, customNextFn)
  })

  nestApp.listen(PORT).then(() => {
    console.log(`> BE ready on ${PORT}`)
  })
}

main()
