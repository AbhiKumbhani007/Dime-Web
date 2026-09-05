import 'server-only'
import { prisma } from './prisma'

const CLEANUP_AGE_MS = 60 * 60 * 1000

export function rateLimitKey(routeGroup: string, request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown'
  return `${routeGroup}:${ip}`
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const windowMs = windowSeconds * 1000
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs)

  await prisma.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: new Date(Date.now() - CLEANUP_AGE_MS) } },
  })

  const bucket = await prisma.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  })

  return bucket.count <= limit
}
