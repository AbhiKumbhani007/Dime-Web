import 'server-only'
import { jwtVerify } from 'jose'

export interface JwtPayload {
  userId: string
  email: string
}

export class AuthError extends Error {}

function secretKey() {
  return new TextEncoder().encode(process.env.JWT_ACCESS_SECRET)
}

export async function authenticate(request: Request): Promise<JwtPayload> {
  const header = request.headers.get('authorization')
  const token = header?.startsWith('Bearer ')
    ? header.slice('Bearer '.length)
    : null
  if (!token) throw new AuthError('Invalid or missing token')

  let payload: Record<string, unknown>
  try {
    ;({ payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
    }))
  } catch {
    throw new AuthError('Invalid or missing token')
  }

  if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') {
    throw new AuthError('Invalid or missing token')
  }

  return { userId: payload.userId, email: payload.email }
}
