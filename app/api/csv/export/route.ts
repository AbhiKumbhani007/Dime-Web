import { authenticate, AuthError } from '@/lib/server/auth/authenticate'
import { apiError } from '@/lib/server/errorResponse'
import { checkRateLimit, rateLimitKey } from '@/lib/server/rateLimit'
import { prisma } from '@/lib/server/prisma'
import { exportRows, exportFileName } from '@/lib/server/csv/csv.service'
import { ExportQuerySchema } from '@/lib/server/csv/csv.schema'

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

// Tighter than the global default — matches dime-api's per-route
// `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }` override on
// this one route. Replaces the global limit rather than stacking with it,
// same as the Fastify plugin's own per-route override semantics.
async function checkExportRateLimit(request: Request) {
  const allowed = await checkRateLimit(
    rateLimitKey('csv-export', request),
    envNumber('RATE_LIMIT_CSV_EXPORT_MAX', 10),
    envNumber('RATE_LIMIT_WINDOW_SECONDS', 60)
  )
  return allowed
    ? null
    : apiError(429, 'RATE_LIMITED', 'Too many requests, try again later')
}

// The only route in the API with no JSON envelope — don't wrap this in
// {data} during a future consistency pass, it would break the frontend's
// fetch().blob() download flow.
export async function GET(request: Request) {
  try {
    const limited = await checkExportRateLimit(request)
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
    const parsed = ExportQuerySchema.safeParse(query)
    if (!parsed.success) {
      return apiError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message ?? 'Invalid query'
      )
    }

    // Buffered in memory rather than streamed as a Web ReadableStream — see
    // the TDD's Architecture table (data volumes are small; the existing
    // 500-row cursor-page cap already bounds a single export).
    let body = ''
    for await (const chunk of exportRows(prisma, userId, parsed.data)) {
      body += chunk
    }

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFileName()}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}
