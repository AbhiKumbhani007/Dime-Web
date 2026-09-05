import { NextResponse } from 'next/server'
import { authenticate, AuthError } from '@/lib/server/auth/authenticate'
import { apiError } from '@/lib/server/errorResponse'
import { checkRateLimit, rateLimitKey } from '@/lib/server/rateLimit'
import { prisma } from '@/lib/server/prisma'
import {
  updateCategory,
  deleteCategory,
} from '@/lib/server/categories/categories.service'
import {
  UpdateCategoryBodySchema,
  CategoryParamsSchema,
} from '@/lib/server/categories/categories.schema'

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

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
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

  const params = await context.params
  const paramsParsed = CategoryParamsSchema.safeParse(params)
  if (!paramsParsed.success) {
    return apiError(
      400,
      'VALIDATION_ERROR',
      paramsParsed.error.issues[0]?.message ?? 'Invalid params'
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(400, 'VALIDATION_ERROR', 'Invalid JSON body')
  }

  const bodyParsed = UpdateCategoryBodySchema.safeParse(body)
  if (!bodyParsed.success) {
    return apiError(
      400,
      'VALIDATION_ERROR',
      bodyParsed.error.issues[0]?.message ?? 'Validation error'
    )
  }

  try {
    const category = await updateCategory(
      prisma,
      userId,
      paramsParsed.data.id,
      bodyParsed.data
    )
    return NextResponse.json({ category }, { status: 200 })
  } catch (err: unknown) {
    const e = err as { code?: string; statusCode?: number; message?: string }
    if (e.code === 'DUPLICATE_NAME') {
      return apiError(
        409,
        'CONFLICT',
        'A category with this name already exists'
      )
    }
    if (e.statusCode === 404) {
      return apiError(404, 'NOT_FOUND', e.message ?? 'Category not found')
    }
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}

export async function DELETE(request: Request, context: RouteContext) {
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

  const params = await context.params
  const paramsParsed = CategoryParamsSchema.safeParse(params)
  if (!paramsParsed.success) {
    return apiError(
      400,
      'VALIDATION_ERROR',
      paramsParsed.error.issues[0]?.message ?? 'Invalid params'
    )
  }

  try {
    await deleteCategory(prisma, userId, paramsParsed.data.id)
    return new NextResponse(null, { status: 204 })
  } catch (err: unknown) {
    const e = err as { code?: string; statusCode?: number }
    if (e.code === 'CATEGORY_IN_USE') {
      return apiError(
        409,
        'CONFLICT',
        'Category is used by existing transactions'
      )
    }
    if (e.statusCode === 404) {
      return apiError(404, 'NOT_FOUND', 'Category not found')
    }
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}
