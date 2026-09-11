// @vitest-environment node
//
// Real-concurrency regression tests. A mocked Prisma client can't prove a
// real race is handled — two `vi.fn()` calls never actually interleave. This
// file uses the REAL (unmocked) `@/lib/server/prisma` singleton against a
// live local Postgres database and fires genuinely overlapping async calls
// directly at the route handlers via `Promise.all`, which is what actually
// hits the database concurrently (the bottleneck proving/disproving the
// race is the DB round-trip, not whether the two calls came in over two
// separate HTTP sockets or two `Promise.all`-scheduled handler invocations
// in the same Node process — both produce two overlapping, unserialized
// Prisma queries against the same rows).
//
// Requires a reachable Postgres at DATABASE_URL (defaults to the same
// localhost:5432/dime_dev this repo's .env.local already points at). If the
// database isn't reachable, every test in this file is skipped rather than
// failing the suite — this file intentionally does NOT mock prisma, so it
// cannot run without a real database.
//
// These tests found two real bugs (both now fixed in auth.service.ts, see
// the "regression" assertions below): concurrent duplicate registration and
// concurrent refresh-token reuse both used to 500 for the losing request
// instead of cleanly 409/401ing, because the loser's Prisma error (P2002 /
// P2025) was never caught and translated.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://akumbhani007@localhost:5432/dime_dev'
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ??
  'dime-access-secret-minimum-32-characters-long'

// A run-scoped, exact-match domain so cleanup never has to guess at a
// wildcard/contains pattern that could sweep up rows this run didn't create
// (this repo's local Postgres is a shared dev database — other worktrees'
// sessions may be using it at the same time).
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const runEmail = (label: string) =>
  `auth-concurrency-live-${RUN_ID}-${label}@adversarial-test.invalid`
const createdEmails = new Set<string>()

let dbReady = false
let prisma: typeof import('@/lib/server/prisma').prisma
let registerPost: typeof import('./register/route').POST
let refreshPost: typeof import('./refresh/route').POST

beforeAll(async () => {
  try {
    ;({ prisma } = await import('@/lib/server/prisma'))
    await prisma.$queryRaw`SELECT 1`
    ;({ POST: registerPost } = await import('./register/route'))
    ;({ POST: refreshPost } = await import('./refresh/route'))
    // Clear the fixed-window bucket this run's unmarked requests fall into
    // (no x-forwarded-for on a directly-invoked Request) so an unrelated
    // prior run's count can't spuriously 429 this one.
    await prisma.rateLimitBucket.deleteMany({
      where: { key: 'global:unknown' },
    })
    dbReady = true
  } catch {
    dbReady = false
  }
}, 30_000)

afterAll(async () => {
  if (!dbReady || !prisma) return
  if (createdEmails.size > 0) {
    await prisma.user.deleteMany({
      where: { email: { in: Array.from(createdEmails) } },
    })
  }
  await prisma.rateLimitBucket.deleteMany({ where: { key: 'global:unknown' } })
})

function makeRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe.runIf(
  await (async () => {
    // Cheap synchronous-ish pre-check so describe.skipIf below has an answer
    // before beforeAll runs — actual readiness is re-verified in beforeAll.
    try {
      const net = await import('node:net')
      const url = new URL(
        process.env.DATABASE_URL ??
          'postgresql://akumbhani007@localhost:5432/dime_dev'
      )
      return await new Promise<boolean>((resolve) => {
        const socket = net.connect(
          Number(url.port || 5432),
          url.hostname,
          () => {
            socket.end()
            resolve(true)
          }
        )
        socket.on('error', () => resolve(false))
        socket.setTimeout(2000, () => {
          socket.destroy()
          resolve(false)
        })
      })
    } catch {
      return false
    }
  })()
)('auth routes — real concurrent requests against a live database', () => {
  it('concurrent duplicate registration: exactly one 201, the other a clean 409 (never a 500), and exactly one user row', async () => {
    expect(dbReady).toBe(true)
    const email = runEmail('register-race')
    createdEmails.add(email)

    const fire = () =>
      registerPost(
        makeRequest('http://localhost/api/auth/register', {
          email,
          password: 'password123',
        })
      )

    const [a, b] = await Promise.all([fire(), fire()])
    const statuses = [a.status, b.status].sort()

    // Regression assertion: this used to be [201, 500] before the P2002
    // catch was added to registerUser(). A real race must never surface an
    // uncaught 500 — the documented contract for a duplicate email is 409.
    expect(statuses).toEqual([201, 409])

    const winner = a.status === 201 ? a : b
    const loser = a.status === 201 ? b : a
    const winnerBody = await winner.json()
    const loserBody = await loser.json()
    expect(winnerBody.user.email).toBe(email)
    expect(loserBody.error).toEqual({
      code: 'CONFLICT',
      message: 'Email already registered',
    })

    const rows = await prisma.user.findMany({ where: { email } })
    expect(rows).toHaveLength(1)
  }, 20_000)

  it('concurrent refresh reuse of the same valid token: exactly one 200, the other a clean 401 (never a 500)', async () => {
    expect(dbReady).toBe(true)
    const email = runEmail('refresh-race')
    createdEmails.add(email)

    const regResponse = await registerPost(
      makeRequest('http://localhost/api/auth/register', {
        email,
        password: 'password123',
      })
    )
    expect(regResponse.status).toBe(201)
    const { refreshToken } = await regResponse.json()

    const fire = () =>
      refreshPost(
        makeRequest('http://localhost/api/auth/refresh', { refreshToken })
      )

    const [a, b] = await Promise.all([fire(), fire()])
    const statuses = [a.status, b.status].sort()

    // Regression assertion: this used to be [200, 500] before the P2025
    // catch was added to refreshTokens(). Reuse under a genuine race must
    // still land on the documented 401 for the loser, never a 500.
    expect(statuses).toEqual([200, 401])

    const winner = a.status === 200 ? a : b
    const loser = a.status === 200 ? b : a
    const winnerBody = await winner.json()
    const loserBody = await loser.json()
    expect(winnerBody.refreshToken).toEqual(expect.any(String))
    expect(winnerBody.refreshToken).not.toBe(refreshToken)
    expect(loserBody.error.code).toBe('UNAUTHORIZED')

    // Confirms this is genuine single-winner rotation, not "both callers
    // get a valid-but-different token pair" — the original token is gone,
    // and only the winner's newly-issued token is a live row.
    const oldRow = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    })
    expect(oldRow).toBeNull()
    const newRow = await prisma.refreshToken.findUnique({
      where: { token: winnerBody.refreshToken },
    })
    expect(newRow).not.toBeNull()
  }, 20_000)
})
