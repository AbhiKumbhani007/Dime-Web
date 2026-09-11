// @vitest-environment node
//
// Adversarial, real-Postgres concurrency test for POST /api/ledger/people
// and PATCH /api/ledger/people/:id (rename). Unlike categories and
// templates, LedgerPerson.name has no DB unique constraint — the duplicate
// check in lib/server/ledger/ledger.service.ts's createPerson/updatePerson
// is a plain application-level "findFirst, then create/update" (case-
// insensitive), which is a classic check-then-act race. Confirmed via a
// throwaway script against the real dime_dev database before this fix
// landed: 20 genuinely concurrent createPerson('Carol') calls produced 4
// separate LedgerPerson rows named "Carol" for the same user, each POST
// returning 201 — the documented "409 duplicate name" contract
// (docs/api.md's ledger table) did not hold under real concurrency.
//
// ledger.routes.test.ts mocks Prisma entirely and can't catch this — a
// mocked findFirst/create pair never actually races. This file fires real,
// genuinely overlapping requests at the real route handlers against the
// real database and inspects the actual rows left behind, proving the fix
// (a Postgres SERIALIZABLE-isolation retry around the check-then-write,
// see ledger.service.ts's withSerializableRetry) actually holds.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'crypto'

const dotenv = await import('dotenv')
dotenv.config({ path: '.env.local' })

const { POST } = await import('./people/route')
const { PATCH } = await import('./people/[id]/route')
const { prisma } = await import('@/lib/server/prisma')
const { registerUser } = await import('@/lib/server/auth/auth.service')

const TEST_SECRET =
  'test-jwt-access-secret-at-least-32-characters-concurrency-ldg'

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

describe('POST /api/ledger/people — real concurrent duplicate-name race', () => {
  let userId: string
  let token: string
  const email = `concurrency-ldg-${Date.now()}-${randomUUID()}@dime.test`

  beforeAll(async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.stubEnv('RATE_LIMIT_MAX', '100000')
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '60')

    const { user, tokens } = await registerUser(
      prisma,
      email,
      'Sup3rSecureP@ss1',
      'Concurrency Ledger Tester'
    )
    userId = user.id
    token = tokens.accessToken
  })

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    vi.unstubAllEnvs()
    await prisma.$disconnect()
  })

  it('two genuinely concurrent POSTs with the identical name: exactly one 201, one clean 409, one row', async () => {
    const body = { name: 'ConcurrencyBob' }

    const [resA, resB] = await Promise.all([
      POST(
        makeRequest('POST', 'http://localhost/api/ledger/people', {
          token,
          body,
        })
      ),
      POST(
        makeRequest('POST', 'http://localhost/api/ledger/people', {
          token,
          body,
        })
      ),
    ])

    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([201, 409])

    const loser = resA.status === 409 ? resA : resB
    const loserJson = await loser.json()
    expect(loserJson.error.code).toBe('CONFLICT')

    const rows = await prisma.ledgerPerson.findMany({
      where: { userId, name: 'ConcurrencyBob' },
    })
    expect(rows).toHaveLength(1)
  })

  it('20 genuinely concurrent identical-name POSTs still leave exactly one winner and one row (pre-fix: 4/20 all "succeeded")', async () => {
    const body = { name: 'ConcurrencyCarol' }
    const concurrency = 20

    const results = await Promise.all(
      Array.from({ length: concurrency }, () =>
        POST(
          makeRequest('POST', 'http://localhost/api/ledger/people', {
            token,
            body,
          })
        )
      )
    )

    const succeeded = results.filter((r) => r.status === 201).length
    const conflicted = results.filter((r) => r.status === 409).length
    expect(succeeded).toBe(1)
    expect(conflicted).toBe(concurrency - 1)

    const rows = await prisma.ledgerPerson.findMany({
      where: { userId, name: 'ConcurrencyCarol' },
    })
    expect(rows).toHaveLength(1)
  })

  it('the case-insensitive check also holds under concurrency (mixed-case duplicates of the same name)', async () => {
    const names = ['DAVE', 'dave', 'Dave', 'dAvE', 'DaVe']

    const results = await Promise.all(
      names.map((name) =>
        POST(
          makeRequest('POST', 'http://localhost/api/ledger/people', {
            token,
            body: { name },
          })
        )
      )
    )

    const succeeded = results.filter((r) => r.status === 201).length
    const conflicted = results.filter((r) => r.status === 409).length
    expect(succeeded).toBe(1)
    expect(conflicted).toBe(names.length - 1)

    const rows = await prisma.ledgerPerson.findMany({
      where: { userId, name: { in: names } },
    })
    expect(rows).toHaveLength(1)
  })
})

describe('PATCH /api/ledger/people/:id — real concurrent rename-to-duplicate race', () => {
  let userId: string
  let token: string
  let targetId: string
  let existingId: string
  const email = `concurrency-ldg-rename-${Date.now()}-${randomUUID()}@dime.test`

  beforeAll(async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.stubEnv('RATE_LIMIT_MAX', '100000')
    vi.stubEnv('RATE_LIMIT_WINDOW_SECONDS', '60')

    const { user, tokens } = await registerUser(
      prisma,
      email,
      'Sup3rSecureP@ss1',
      'Concurrency Rename Tester'
    )
    userId = user.id
    token = tokens.accessToken

    const existing = await prisma.ledgerPerson.create({
      data: { name: 'AlreadyNamedEve', userId, color: '#6366f1' },
    })
    existingId = existing.id

    const target = await prisma.ledgerPerson.create({
      data: { name: 'RenameMeA', userId, color: '#6366f1' },
    })
    targetId = target.id
  })

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    vi.unstubAllEnvs()
    await prisma.$disconnect()
  })

  it('renaming to an already-existing name always 409s, even fired concurrently many times', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        PATCH(
          makeRequest(
            'PATCH',
            `http://localhost/api/ledger/people/${targetId}`,
            {
              token,
              body: { name: 'AlreadyNamedEve' },
            }
          ),
          { params: Promise.resolve({ id: targetId }) }
        )
      )
    )

    // The name "AlreadyNamedEve" was already taken before any of these
    // fired — every single attempt must be rejected, none may succeed.
    expect(results.every((r) => r.status === 409)).toBe(true)

    const stillOriginal = await prisma.ledgerPerson.findUnique({
      where: { id: targetId },
    })
    expect(stillOriginal?.name).toBe('RenameMeA')

    const rows = await prisma.ledgerPerson.findMany({
      where: {
        userId,
        name: { equals: 'AlreadyNamedEve', mode: 'insensitive' },
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(existingId)
  })
})
