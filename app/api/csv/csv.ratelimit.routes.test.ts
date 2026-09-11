// @vitest-environment node
//
// Adversarial, real-Postgres test proving GET /api/csv/export's tighter
// RATE_LIMIT_CSV_EXPORT_MAX override fires independently of the global
// RATE_LIMIT_MAX bucket, through the real route handlers (not the isolated
// checkRateLimit() unit) — a client nowhere near the global limit still
// gets 429'd on export after its own smaller cap, and hammering the global
// route never consumes from (or is consumed by) the export bucket. This is
// the exact scenario csv.routes.test.ts can't cover, since it mocks the
// rate-limit bucket away entirely.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'crypto'

const dotenv = await import('dotenv')
dotenv.config({ path: '.env.local' })

const { GET: exportGet } = await import('./export/route')
const { GET: categoriesGet } = await import('../categories/route')
const { prisma } = await import('@/lib/server/prisma')
const { registerUser } = await import('@/lib/server/auth/auth.service')

const TEST_SECRET =
  'test-jwt-access-secret-at-least-32-characters-concurrency-csv'

function uniqueIp(): string {
  const a = Math.floor(Math.random() * 200) + 10
  const b = Math.floor(Math.random() * 200) + 10
  return `10.88.${a}.${b}`
}

function exportRequest(token: string, ip: string) {
  return new Request('http://localhost/api/csv/export', {
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': ip },
  })
}

function categoriesRequest(token: string, ip: string) {
  return new Request('http://localhost/api/categories', {
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': ip },
  })
}

describe('csv-export rate limit override — independent from the global bucket', () => {
  let token: string
  let userId: string
  const email = `concurrency-csvrl-${Date.now()}-${randomUUID()}@dime.test`

  beforeAll(async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    const { user, tokens } = await registerUser(
      prisma,
      email,
      'Sup3rSecureP@ss1',
      'CSV Rate Limit Tester'
    )
    userId = user.id
    token = tokens.accessToken
  })

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    vi.unstubAllEnvs()
    await prisma.$disconnect()
  })

  it('a client nowhere near the global limit still gets 429d on export after its own smaller cap', async () => {
    const ip = uniqueIp()
    vi.stubEnv('RATE_LIMIT_CSV_EXPORT_MAX', '3')
    vi.stubEnv('RATE_LIMIT_MAX', '1000')
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '60')

    for (let i = 1; i <= 3; i++) {
      const res = await exportGet(exportRequest(token, ip))
      expect(res.status, `export #${i} of 3`).toBe(200)
    }

    const blocked = await exportGet(exportRequest(token, ip))
    expect(blocked.status).toBe(429)
    const body = await blocked.json()
    expect(body.error.code).toBe('RATE_LIMITED')

    // The client has made only 4 requests total, laughably far from the
    // global limit of 1000 — the global route must still be wide open.
    const globalRes = await categoriesGet(categoriesRequest(token, ip))
    expect(globalRes.status).toBe(200)
  })

  it('hammering the global route never feeds the export bucket or un-blocks it', async () => {
    const ip = uniqueIp()
    vi.stubEnv('RATE_LIMIT_CSV_EXPORT_MAX', '2')
    vi.stubEnv('RATE_LIMIT_MAX', '1000')
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '60')

    // Exhaust the export bucket for this client first.
    expect((await exportGet(exportRequest(token, ip))).status).toBe(200)
    expect((await exportGet(exportRequest(token, ip))).status).toBe(200)
    expect((await exportGet(exportRequest(token, ip))).status).toBe(429)

    // Now hammer the global route 30 times — none of this should touch the
    // export bucket's count, and the export bucket must remain exhausted
    // (not reset, not further inflated in a way that matters).
    for (let i = 0; i < 30; i++) {
      const res = await categoriesGet(categoriesRequest(token, ip))
      expect(res.status, `global hit #${i + 1}`).toBe(200)
    }

    expect((await exportGet(exportRequest(token, ip))).status).toBe(429)

    const csvKey = `csv-export:${ip}`
    const csvBucket = await prisma.rateLimitBucket.findFirst({
      where: { key: csvKey },
    })
    // 2 initial + 1 blocked-but-still-counted + 1 final check = 4, never
    // inflated by the 30 global hits.
    expect(csvBucket?.count).toBe(4)
  })
})
