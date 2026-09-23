import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { getToken } from '../data/token'

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    try {
      // const { token: validToken } = await getToken()

      // const authHeader = req.headers['authorization']
      // if (!authHeader || !authHeader.startsWith('Bearer ')) {
      //   return res
      //     .status(401)
      //     .json({ message: 'Unauthorized: Bearer token missing or malformed' })
      // }

      // // const bearerToken = authHeader.split(' ')[1]
      // const bearerToken = authHeader.split('Bearer ')[1]

      // if (bearerToken !== validToken) {
      //   return res.status(401).json({ message: 'Unauthorized: Invalid token' })
      // }

      next()
    } catch (error) {
      console.error('Error in middleware:', error)
      return res.status(500).json({ message: 'Internal Server Error' })
    }
  }
}
