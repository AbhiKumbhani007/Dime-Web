import { NextResponse } from 'next/server'
import { authenticate, AuthError } from '@/lib/server/auth/authenticate'
import { apiError } from '@/lib/server/errorResponse'
import { checkRateLimit, rateLimitKey } from '@/lib/server/rateLimit'
import { prisma } from '@/lib/server/prisma'
import {
  getTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/lib/server/transactions/transactions.service'
import {
  UpdateTransactionBodySchema,
  TransactionParamsSchema,
} from '@/lib/server/transactions/transactions.schema'

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

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
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

    const params = await context.params
    const paramsParsed = TransactionParamsSchema.safeParse(params)
    if (!paramsParsed.success) {
      return apiError(
        400,
        'VALIDATION_ERROR',
        paramsParsed.error.issues[0]?.message ?? 'Invalid params'
      )
    }

    try {
      const transaction = await getTransaction(
        prisma,
        userId,
        paramsParsed.data.id
      )
      return NextResponse.json({ transaction }, { status: 200 })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string }
      if (e.statusCode === 404) {
        return apiError(404, 'NOT_FOUND', e.message ?? 'Transaction not found')
      }
      return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
    }
  } catch {
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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

    const params = await context.params
    const paramsParsed = TransactionParamsSchema.safeParse(params)
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

    const bodyParsed = UpdateTransactionBodySchema.safeParse(body)
    if (!bodyParsed.success) {
      return apiError(
        400,
        'VALIDATION_ERROR',
        bodyParsed.error.issues[0]?.message ?? 'Validation error'
      )
    }

    try {
      const transaction = await updateTransaction(
        prisma,
        userId,
        paramsParsed.data.id,
        bodyParsed.data
      )
      return NextResponse.json({ transaction }, { status: 200 })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string }
      if (e.statusCode === 404) {
        return apiError(404, 'NOT_FOUND', e.message ?? 'Transaction not found')
      }
      return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
    }
  } catch {
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}

export async function DELETE(request: Request, context: RouteContext) {
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

    const params = await context.params
    const paramsParsed = TransactionParamsSchema.safeParse(params)
    if (!paramsParsed.success) {
      return apiError(
        400,
        'VALIDATION_ERROR',
        paramsParsed.error.issues[0]?.message ?? 'Invalid params'
      )
    }

    try {
      await deleteTransaction(prisma, userId, paramsParsed.data.id)
      return new NextResponse(null, { status: 204 })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string }
      if (e.statusCode === 404) {
        return apiError(404, 'NOT_FOUND', e.message ?? 'Transaction not found')
      }
      return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
    }
  } catch {
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}
