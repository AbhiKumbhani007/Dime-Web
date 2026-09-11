import { NextResponse } from 'next/server'
import { authenticate, AuthError } from '@/lib/server/auth/authenticate'
import { apiError } from '@/lib/server/errorResponse'
import { checkRateLimit, rateLimitKey } from '@/lib/server/rateLimit'
import { prisma } from '@/lib/server/prisma'
import { previewImport } from '@/lib/server/csv/csv.service'

const MAX_FILE_BYTES = 2 * 1024 * 1024

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

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return apiError(400, 'VALIDATION_ERROR', 'No file uploaded')
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return apiError(400, 'VALIDATION_ERROR', 'No file uploaded')
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return apiError(400, 'VALIDATION_ERROR', 'File must be a .csv file')
    }
    // File.size is available synchronously, without reading any bytes — the
    // whole point of checking it first (see the TDD's Architecture table).
    if (file.size > MAX_FILE_BYTES) {
      return apiError(400, 'VALIDATION_ERROR', 'File exceeds the 2MB limit')
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    try {
      const result = await previewImport(prisma, userId, {
        buffer,
        fileName: file.name,
      })
      return NextResponse.json(result, { status: 200 })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string }
      if (e.statusCode === 400) {
        return apiError(
          400,
          'VALIDATION_ERROR',
          e.message ?? 'Invalid CSV file'
        )
      }
      return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
    }
  } catch {
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}
