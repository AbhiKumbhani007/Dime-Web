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
  const now = Date.now()
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs)

  // Never delete the bucket this call is about to touch: for windowSeconds
  // > 1h, windowStart can already be more than an hour old (e.g. a daily
  // window's start-of-day), which would otherwise wipe the active count on
  // every single call and make the limit unenforceable.
  const cleanupCutoff = Math.min(now - CLEANUP_AGE_MS, windowStart.getTime())
  await prisma.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: new Date(cleanupCutoff) } },
  })

  const bucket = await prisma.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  })

  return bucket.count <= limit
}
