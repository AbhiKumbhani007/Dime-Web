// @vitest-environment node
//
// Adversarial, real-Postgres test proving RATE_LIMIT_MAX/RATE_LIMIT_WINDOW_SECONDS
// are correctly wired end-to-end through a real route handler (not just the
// isolated checkRateLimit() unit — see lib/server/rateLimit.concurrency.test.ts
// for that), including under genuine concurrent load. categories.routes.test.ts
// mocks the rate-limit bucket entirely, so it can't prove any of this.
//
// Every test here uses its own unique x-forwarded-for value so its bucket
// can never collide with another test file's (or another parallel agent's)
// traffic against the same shared `dime_dev` database and the same hard-coded
// 'global' route group.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'crypto'

const dotenv = await import('dotenv')
dotenv.config({ path: '.env.local' })

const { GET } = await import('./route')
const { prisma } = await import('@/lib/server/prisma')
const { registerUser } = await import('@/lib/server/auth/auth.service')

const TEST_SECRET =
  'test-jwt-access-secret-at-least-32-characters-concurrency-rl'

function uniqueIp(): string {
  const a = Math.floor(Math.random() * 200) + 10
  const b = Math.floor(Math.random() * 200) + 10
  return `10.77.${a}.${b}`
}

function makeRequest(token: string, ip: string) {
  return new Request('http://localhost/api/categories', {
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': ip },
  })
}

describe('GET /api/categories rate limiting — real route handler, real Postgres bucket', () => {
  let token: string
  let userId: string
  const email = `concurrency-rl-${Date.now()}-${randomUUID()}@dime.test`

  beforeAll(async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    const { user, tokens } = await registerUser(
      prisma,
      email,
      'Sup3rSecureP@ss1',
      'Rate Limit Tester'
    )
    userId = user.id
    token = tokens.accessToken
  })

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    vi.unstubAllEnvs()
    await prisma.$disconnect()
  })

  it('allows exactly RATE_LIMIT_MAX requests and 429s the next, with the documented error envelope', async () => {
    const ip = uniqueIp()
    vi.stubEnv('RATE_LIMIT_MAX', '4')
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '60')

    for (let i = 1; i <= 4; i++) {
      const res = await GET(makeRequest(token, ip))
      expect(res.status, `request #${i} of 4`).toBe(200)
    }

    const blocked = await GET(makeRequest(token, ip))
    expect(blocked.status).toBe(429)
    const body = await blocked.json()
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('a request in the next window succeeds again — the limit is not a one-time lockout', async () => {
    const ip = uniqueIp()
    vi.stubEnv('RATE_LIMIT_MAX', '2')
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '1')

    expect((await GET(makeRequest(token, ip))).status).toBe(200)
    expect((await GET(makeRequest(token, ip))).status).toBe(200)
    expect((await GET(makeRequest(token, ip))).status).toBe(429)

    await new Promise((resolve) => setTimeout(resolve, 1250))

    expect((await GET(makeRequest(token, ip))).status).toBe(200)
  })

  it('20 genuinely concurrent requests against RATE_LIMIT_MAX=8 let exactly 8 through', async () => {
    const ip = uniqueIp()
    vi.stubEnv('RATE_LIMIT_MAX', '8')
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '60')

    const results = await Promise.all(
      Array.from({ length: 20 }, () => GET(makeRequest(token, ip)))
    )

    const okCount = results.filter((r) => r.status === 200).length
    const blockedCount = results.filter((r) => r.status === 429).length
    expect(okCount).toBe(8)
    expect(blockedCount).toBe(12)
  })
})
