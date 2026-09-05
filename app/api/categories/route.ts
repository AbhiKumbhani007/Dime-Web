import { NextResponse } from 'next/server'
import { authenticate, AuthError } from '@/lib/server/auth/authenticate'
import { apiError } from '@/lib/server/errorResponse'
import { checkRateLimit, rateLimitKey } from '@/lib/server/rateLimit'
import { prisma } from '@/lib/server/prisma'
import {
  listCategories,
  createCategory,
} from '@/lib/server/categories/categories.service'
import { CreateCategoryBodySchema } from '@/lib/server/categories/categories.schema'

const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 100)
const RATE_LIMIT_WINDOW_SECONDS = Number(
  process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60
)

async function checkGlobalRateLimit(request: Request) {
  const allowed = await checkRateLimit(
    rateLimitKey('global', request),
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_SECONDS
  )
  return allowed
    ? null
    : apiError(429, 'RATE_LIMITED', 'Too many requests, try again later')
}

export async function GET(request: Request) {
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

  const categories = await listCategories(prisma, userId)
  return NextResponse.json({ categories }, { status: 200 })
}

export async function POST(request: Request) {
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

  const parsed = CreateCategoryBodySchema.safeParse(body)
  if (!parsed.success) {
    return apiError(
      400,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Validation error'
    )
  }

  try {
    const category = await createCategory(prisma, userId, parsed.data)
    return NextResponse.json({ category }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'DUPLICATE_NAME') {
      return apiError(
        409,
        'CONFLICT',
        'A category with this name already exists'
      )
    }
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}
