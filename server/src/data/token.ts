import { db } from '../lib/db'

export const getToken = async () => {
  try {
    const token = await db.tokens.findFirst()

    return token
  } catch {
    return null
  }
}
