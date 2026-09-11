// @vitest-environment node
//
// Adversarial, real-Postgres concurrency test for POST /api/templates.
// templates.routes.test.ts mocks Prisma entirely, so it can't prove
// anything about the duplicate-label check surviving genuine concurrent
// writes. This file fires real, genuinely overlapping POST requests at the
// real route handler against the real `dime_dev` database and inspects the
// actual rows left behind.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'crypto'

const dotenv = await import('dotenv')
dotenv.config({ path: '.env.local' })

const { POST } = await import('./route')
const { prisma } = await import('@/lib/server/prisma')
const { registerUser } = await import('@/lib/server/auth/auth.service')

const TEST_SECRET =
  'test-jwt-access-secret-at-least-32-characters-concurrency-tpl'

function makeRequest(
  method: string,
  url: string,
  { token, body }: { token?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/templates — real concurrent duplicate-label race', () => {
  let userId: string
  let token: string
  const email = `concurrency-tpl-${Date.now()}-${randomUUID()}@dime.test`

  beforeAll(async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.stubEnv('RATE_LIMIT_MAX', '100000')
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '60')

    const { user, tokens } = await registerUser(
      prisma,
      email,
      'Sup3rSecureP@ss1',
      'Concurrency Template Tester'
    )
    userId = user.id
    token = tokens.accessToken
  })

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    vi.unstubAllEnvs()
    await prisma.$disconnect()
  })

  it('two genuinely concurrent POSTs with the identical label: exactly one 201, one clean 409, one row', async () => {
    const body = { label: 'ConcurrencyDupeTemplate' }

    const [resA, resB] = await Promise.all([
      POST(
        makeRequest('POST', 'http://localhost/api/templates', { token, body })
      ),
      POST(
        makeRequest('POST', 'http://localhost/api/templates', { token, body })
      ),
    ])

    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([201, 409])

    const loser = resA.status === 409 ? resA : resB
    const loserJson = await loser.json()
    expect(loserJson.error.code).toBe('CONFLICT')

    const rows = await prisma.template.findMany({
      where: { userId, label: 'ConcurrencyDupeTemplate' },
    })
    expect(rows).toHaveLength(1)
  })

  it('10 genuinely concurrent identical-label POSTs still leave exactly one winner and one row', async () => {
    const body = { label: 'ConcurrencyDupeTemplateBulk' }
    const concurrency = 10

    const results = await Promise.all(
      Array.from({ length: concurrency }, () =>
        POST(
          makeRequest('POST', 'http://localhost/api/templates', { token, body })
        )
      )
    )

    const succeeded = results.filter((r) => r.status === 201).length
    const conflicted = results.filter((r) => r.status === 409).length
    expect(succeeded).toBe(1)
    expect(conflicted).toBe(concurrency - 1)

    const rows = await prisma.template.findMany({
      where: { userId, label: 'ConcurrencyDupeTemplateBulk' },
    })
    expect(rows).toHaveLength(1)
  })
})
