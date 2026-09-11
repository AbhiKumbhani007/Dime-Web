import { NextResponse } from 'next/server'
import { apiError } from '@/lib/server/errorResponse'
import { checkRateLimit, rateLimitKey } from '@/lib/server/rateLimit'
import { prisma } from '@/lib/server/prisma'
import { loginUser } from '@/lib/server/auth/auth.service'
import { LoginBodySchema } from '@/lib/server/auth/auth.schema'

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

function mapAuthError(err: unknown) {
  const e = err as { statusCode?: number; message?: string }
  switch (e.statusCode) {
    case 400:
      return apiError(400, 'VALIDATION_ERROR', e.message ?? 'Validation error')
    case 401:
      return apiError(401, 'UNAUTHORIZED', e.message ?? 'Unauthorized')
    case 404:
      return apiError(404, 'NOT_FOUND', e.message ?? 'Not found')
    case 409:
      return apiError(409, 'CONFLICT', e.message ?? 'Conflict')
    default:
      return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}

export async function POST(request: Request) {
  try {
    const limited = await checkGlobalRateLimit(request)
    if (limited) return limited

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid JSON body')
    }

    const parsed = LoginBodySchema.safeParse(body)
    if (!parsed.success) {
      return apiError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Validation error'
      )
    }

    try {
      const { tokens, user } = await loginUser(
        prisma,
        parsed.data.email,
        parsed.data.password
      )
      return NextResponse.json({ ...tokens, user }, { status: 200 })
    } catch (err) {
      return mapAuthError(err)
    }
  } catch {
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}
