import { NextResponse } from 'next/server'
import { authenticate, AuthError } from '@/lib/server/auth/authenticate'
import { apiError } from '@/lib/server/errorResponse'
import { checkRateLimit, rateLimitKey } from '@/lib/server/rateLimit'
import { prisma } from '@/lib/server/prisma'
import { getByPeriod } from '@/lib/server/analytics/analytics.service'
import { ByPeriodQuerySchema } from '@/lib/server/analytics/analytics.schema'

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

async function checkGlobalRateLimit(request: Request) {
  const allowed = await checkRateLimit(
    rateLimitKey('global', request),
    envNumber('RATE_LIMIT_MAX', 100),
    envNumber('RATE_LIMIT_WINDOW_SECONDS', 60)
  )
  return allowed
    ? null
    : apiError(429, 'RATE_LIMITED', 'Too many requests, try again later')
}

export async function GET(request: Request) {
  try {
    const limited = await checkGlobalRateLimit(request)
    if (limited) return limited

    let userId: string
    try {
      ;({ userId } = await authenticate(request))
    } catch (err) {
      if (err instanceof AuthError) {
        return apiError(401, 'UNAUTHORIZED', 'Invalid or missing token')
      }
      throw err
    }

    const query = Object.fromEntries(new URL(request.url).searchParams)
    const parsed = ByPeriodQuerySchema.safeParse(query)
    if (!parsed.success) {
      return apiError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Validation error'
      )
    }

    // Flat — no wrapper key. lib/api/analytics.ts's already-shipped ByPeriodResult
    // is this exact shape; tdd.md's own contract row for this endpoint was vague
    // on both the query params and the response shape — see tickets/F5.md.
    const result = await getByPeriod(prisma, userId, parsed.data)
    return NextResponse.json(result, { status: 200 })
  } catch {
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}
