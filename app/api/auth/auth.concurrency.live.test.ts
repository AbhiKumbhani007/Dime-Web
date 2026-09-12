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
// Skips entirely (never fails) when no real Postgres is reachable — see
// ledgerDbTestHelpers.ts for why DATABASE_URL must be loaded from
// .env.local explicitly rather than relying on Vitest to have set it. (A
// hardcoded personal-machine fallback URL used to live here instead of using
// that shared helper, which made this suite hard-fail — via a runtime
// `expect(dbReady).toBe(true)` — rather than skip on any machine whose local
// Postgres isn't that exact db/user.)
//
// These tests found two real bugs (both now fixed in auth.service.ts, see
// the "regression" assertions below): concurrent duplicate registration and
// concurrent refresh-token reuse both used to 500 for the losing request
// instead of cleanly 409/401ing, because the loser's Prisma error (P2002 /
// P2025) was never caught and translated.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  isLedgerTestDbAvailable,
  loadLedgerTestEnv,
} from '@/lib/server/ledger/ledgerDbTestHelpers'

loadLedgerTestEnv()
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ??
  'dime-access-secret-minimum-32-characters-long'

const dbAvailable = await isLedgerTestDbAvailable()

// A run-scoped, exact-match domain so cleanup never has to guess at a
// wildcard/contains pattern that could sweep up rows this run didn't create
// (this repo's local Postgres is a shared dev database — other worktrees'
// sessions may be using it at the same time).
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const runEmail = (label: string) =>
  `auth-concurrency-live-${RUN_ID}-${label}@adversarial-test.invalid`
const createdEmails = new Set<string>()

function makeRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe.skipIf(!dbAvailable)(
  'auth routes — real concurrent requests against a live database',
  () => {
    let prisma: PrismaClient
    let registerPost: typeof import('./register/route').POST
    let refreshPost: typeof import('./refresh/route').POST

    beforeAll(async () => {
      ;({ prisma } = await import('@/lib/server/prisma'))
      ;({ POST: registerPost } = await import('./register/route'))
      ;({ POST: refreshPost } = await import('./refresh/route'))
      // Clear the fixed-window bucket this run's unmarked requests fall into
      // (no x-forwarded-for on a directly-invoked Request) so an unrelated
      // prior run's count can't spuriously 429 this one.
      await prisma.rateLimitBucket.deleteMany({
        where: { key: 'global:unknown' },
      })
    })

    afterAll(async () => {
      if (createdEmails.size > 0) {
        await prisma.user.deleteMany({
          where: { email: { in: Array.from(createdEmails) } },
        })
      }
      await prisma.rateLimitBucket.deleteMany({
        where: { key: 'global:unknown' },
      })
    })

    it('concurrent duplicate registration: exactly one 201, the other a clean 409 (never a 500), and exactly one user row', async () => {
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

      // Regression assertion: this used to be [200, 500] before a P2025 catch
      // was added around refreshTokens()'s (then delete-based) rotation.
      // refreshTokens() has since moved to an atomic `updateMany({where:
      // {token, revokedAt: null}, ...})` claim (see the reuse-detection/
      // session-family-revocation fix) which never throws for a losing race —
      // it just reports `count: 0` — so there's no catch to regress anymore,
      // but the loser must still land on the same documented 401, never a 500.
      expect(statuses).toEqual([200, 401])

      const winner = a.status === 200 ? a : b
      const loser = a.status === 200 ? b : a
      const winnerBody = await winner.json()
      const loserBody = await loser.json()
      expect(winnerBody.refreshToken).toEqual(expect.any(String))
      expect(winnerBody.refreshToken).not.toBe(refreshToken)
      expect(loserBody.error.code).toBe('UNAUTHORIZED')

      // Confirms this is genuine single-winner rotation, not "both callers
      // get a valid-but-different token pair" — the original token's row is
      // now revoked (kept, not deleted — see the reuse-detection fix in
      // auth.service.ts's refreshTokens, which needs the row to persist so a
      // later replay of it can still be detected), and only the winner's
      // newly-issued token is a live, unrevoked row.
      const oldRow = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      })
      expect(oldRow).not.toBeNull()
      expect(oldRow?.revokedAt).not.toBeNull()
      const newRow = await prisma.refreshToken.findUnique({
        where: { token: winnerBody.refreshToken },
      })
      expect(newRow).not.toBeNull()
      expect(newRow?.revokedAt).toBeNull()
    }, 20_000)
  }
)
