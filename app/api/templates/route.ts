import { NextResponse } from 'next/server'
import { authenticate, AuthError } from '@/lib/server/auth/authenticate'
import { apiError } from '@/lib/server/errorResponse'
import { checkRateLimit, rateLimitKey } from '@/lib/server/rateLimit'
import { prisma } from '@/lib/server/prisma'
import {
  listTemplates,
  createTemplate,
} from '@/lib/server/templates/templates.service'
import {
  CreateTemplateBodySchema,
  SortQuerySchema,
} from '@/lib/server/templates/templates.schema'

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

    const url = new URL(request.url)
    const queryParsed = SortQuerySchema.safeParse(
      Object.fromEntries(url.searchParams)
    )
    if (!queryParsed.success) {
      return apiError(
        400,
        'VALIDATION_ERROR',
        queryParsed.error.issues[0]?.message ?? 'Invalid query'
      )
    }

    const templates = await listTemplates(prisma, userId, queryParsed.data.sort)
    return NextResponse.json({ templates }, { status: 200 })
  } catch {
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}

export async function POST(request: Request) {
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

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError(400, 'VALIDATION_ERROR', 'Invalid JSON body')
    }

    const parsed = CreateTemplateBodySchema.safeParse(body)
    if (!parsed.success) {
      return apiError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Validation error'
      )
    }

    try {
      const template = await createTemplate(prisma, userId, parsed.data)
      return NextResponse.json({ template }, { status: 201 })
    } catch (err: unknown) {
      const e = err as { code?: string; statusCode?: number; message?: string }
      if (e.code === 'DUPLICATE_LABEL') {
        return apiError(
          409,
          'CONFLICT',
          'A template with this label already exists'
        )
      }
      if (e.statusCode === 404) {
        return apiError(404, 'NOT_FOUND', e.message ?? 'Category not found')
      }
      return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
    }
  } catch {
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}
