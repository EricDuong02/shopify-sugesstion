import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express'
import { Express } from 'express'
import { VersioningType } from '@nestjs/common'

async function bootstrap(server?: Express): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
  )
  app.setGlobalPrefix('api')
  app.enableCors()

  app.enableVersioning({
    type: VersioningType.URI,
  })

  // await app.init();
  return app
}
export default bootstrap
