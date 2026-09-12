// @vitest-environment node
//
// Genuine concurrency test for the ONE explicit optimistic-concurrency
// primitive in this API: POST /api/ledger/people/:id/settle.
//
// tickets/F6.md's own "Open questions" section names exactly this gap:
// "Concurrent settle-all requests actually racing at the database level
// (two real overlapping transactions) — covered only by the unit-level 409
// checks against a mocked Prisma client, not a true concurrency test
// against Postgres." This file closes that gap.
//
// This was first proven against a genuinely running dev server (`next dev
// -p 3116`) with two real overlapping `curl` requests — see the ticket
// report for that transcript. The test below is the persisted, repeatable
// form: it imports the real route handler functions (not mocked — see
// ledger.routes.test.ts's `vi.mock('@/lib/server/prisma', ...)` for
// contrast, which this file deliberately does NOT do) and invokes them
// concurrently via Promise.all against a real Postgres connection pool, so
// two genuinely overlapping SQL transactions are in flight at once — the
// same race a real second HTTP request would create, without depending on a
// live server staying up for every future `npm test` run.
//
// Found via this exact race (both against the live dev server and this
// file's in-process form): settlePerson() previously let the LOSER of a
// race return `200` with `settledCount: 0` but a non-zero `settledAmount`
// (a phantom "you settled ₹X" response for a request that changed nothing),
// and could silently sweep a concurrently-created entry into "settled"
// without it ever appearing in any settledAmount total. Fixed in
// lib/server/ledger/ledger.service.ts's settlePerson() — see the fix
// commit for detail. This file is the regression test for that fix.
//
// Skips entirely (never fails) when no real Postgres is reachable.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { SignJWT } from 'jose'
import {
  isLedgerTestDbAvailable,
  loadLedgerTestEnv,
} from '@/lib/server/ledger/ledgerDbTestHelpers'

loadLedgerTestEnv()

const dbAvailable = await isLedgerTestDbAvailable()

describe.skipIf(!dbAvailable)(
  'POST /api/ledger/people/:id/settle — genuine concurrent HTTP-handler races',
  () => {
    let prisma: PrismaClient
    let POST_SETTLE: typeof import('./people/[id]/settle/route').POST
    let POST_ENTRY: typeof import('./people/[id]/entries/route').POST
    const createdUserIds: string[] = []
    const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    async function makeAuthedUser(label: string) {
      const user = await prisma.user.create({
        data: { email: `ledger-race-${RUN_ID}-${label}@ticket-test.local` },
      })
      createdUserIds.push(user.id)
      const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET)
      const token = await new SignJWT({ userId: user.id, email: user.email })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(secret)
      return { userId: user.id, token }
    }

    function req(
      method: string,
      url: string,
      token: string,
      body?: unknown
    ): Request {
      return new Request(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    }

    beforeAll(async () => {
      ;({ prisma } = await import('@/lib/server/prisma'))
      ;({ POST: POST_SETTLE } = await import('./people/[id]/settle/route'))
      ;({ POST: POST_ENTRY } = await import('./people/[id]/entries/route'))
    })

    afterAll(async () => {
      for (const id of createdUserIds) {
        await prisma.user.delete({ where: { id } }).catch(() => {})
      }
    })

    async function makePersonWithEntry(
      userId: string,
      token: string,
      amount: number
    ): Promise<string> {
      const created = await prisma.ledgerPerson.create({
        data: {
          name: `Race Person ${Math.random().toString(36).slice(2, 8)}`,
          color: '#6366f1',
          userId,
        },
      })
      // The entry itself goes through the real route so it exercises the
      // exact same code path production traffic does.
      await POST_ENTRY(
        req(
          'POST',
          `http://localhost/api/ledger/people/${created.id}/entries`,
          token,
          { amount, type: 'GAVE', date: '2026-01-01T00:00:00.000Z' }
        ),
        { params: Promise.resolve({ id: created.id }) }
      )
      return created.id
    }

    it('two concurrent settle requests with the SAME (correct) expectedBalance: exactly one 200 with the real settledCount/settledAmount, the other a 409 — never both 200, never a phantom settledAmount on a 0-count response', async () => {
      const { userId, token } = await makeAuthedUser('same-expected')
      const personId = await makePersonWithEntry(userId, token, 300)

      const [resA, resB] = await Promise.all([
        POST_SETTLE(
          req(
            'POST',
            `http://localhost/api/ledger/people/${personId}/settle`,
            token,
            { expectedBalance: 300 }
          ),
          { params: Promise.resolve({ id: personId }) }
        ),
        POST_SETTLE(
          req(
            'POST',
            `http://localhost/api/ledger/people/${personId}/settle`,
            token,
            { expectedBalance: 300 }
          ),
          { params: Promise.resolve({ id: personId }) }
        ),
      ])

      const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()])
      const results = [
        { status: resA.status, body: bodyA },
        { status: resB.status, body: bodyB },
      ]

      const winners = results.filter((r) => r.status === 200)
      const losers = results.filter((r) => r.status !== 200)
      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)
      expect(losers[0]?.status).toBe(409)
      expect(losers[0]?.body.error.code).toBe('CONFLICT')

      // The critical invariant the bug violated: a non-200 response must
      // never carry a settledAmount/settledCount payload at all (the error
      // envelope has no such fields) — no phantom success data leaks
      // through on the losing side.
      expect(losers[0]?.body.settledAmount).toBeUndefined()
      expect(losers[0]?.body.settledCount).toBeUndefined()

      expect(winners[0]?.body.settledCount).toBe(1)
      expect(winners[0]?.body.settledAmount).toBe(300)

      // Final state: fully settled, no double-settle, no lost entry.
      const entries = await prisma.ledgerEntry.findMany({
        where: { personId, userId },
      })
      expect(entries).toHaveLength(1)
      expect(entries[0]?.settled).toBe(true)
    })

    it('two concurrent settle requests that both OMIT expectedBalance (the documented skippable guard): still exactly one success and one 409 — omitting the guard must never let both callers believe they settled the same money', async () => {
      const { userId, token } = await makeAuthedUser('omitted-expected')
      const personId = await makePersonWithEntry(userId, token, 1000)

      const [resA, resB] = await Promise.all([
        POST_SETTLE(
          req(
            'POST',
            `http://localhost/api/ledger/people/${personId}/settle`,
            token,
            {}
          ),
          { params: Promise.resolve({ id: personId }) }
        ),
        POST_SETTLE(
          req(
            'POST',
            `http://localhost/api/ledger/people/${personId}/settle`,
            token,
            {}
          ),
          { params: Promise.resolve({ id: personId }) }
        ),
      ])

      const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()])
      const results = [
        { status: resA.status, body: bodyA },
        { status: resB.status, body: bodyB },
      ]
      const winners = results.filter((r) => r.status === 200)
      const losers = results.filter((r) => r.status !== 200)

      // Before the fix: both of these came back 200, one with
      // settledCount:0 / settledAmount:1000 (phantom). After the fix: only
      // one settles, the other gets a 409 rather than lying about it.
      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)
      expect(losers[0]?.status).toBe(409)
      expect(winners[0]?.body.settledCount).toBe(1)
      expect(winners[0]?.body.settledAmount).toBe(1000)

      const entries = await prisma.ledgerEntry.findMany({
        where: { personId, userId, settled: true },
      })
      expect(entries).toHaveLength(1) // settled exactly once, not twice
    })

    it('entry creation racing a concurrent settle for the same person: the new entry is never silently folded into a settledAmount it was never part of — either it is fully accounted for in a successful settle, or the settle rolls back (409) and the entry stays active', async () => {
      const { userId, token } = await makeAuthedUser('create-vs-settle')
      const personId = await makePersonWithEntry(userId, token, 400)

      const [createRes, settleRes] = await Promise.all([
        POST_ENTRY(
          req(
            'POST',
            `http://localhost/api/ledger/people/${personId}/entries`,
            token,
            { amount: 50, type: 'GAVE', date: '2026-01-05T00:00:00.000Z' }
          ),
          { params: Promise.resolve({ id: personId }) }
        ),
        POST_SETTLE(
          req(
            'POST',
            `http://localhost/api/ledger/people/${personId}/settle`,
            token,
            {}
          ),
          { params: Promise.resolve({ id: personId }) }
        ),
      ])

      expect(createRes.status).toBe(201) // creation itself always succeeds
      const settleBody = await settleRes.json()

      const allEntries = await prisma.ledgerEntry.findMany({
        where: { personId, userId },
      })
      expect(allEntries).toHaveLength(2) // the original 400 + the raced-in 50

      const settledEntries = allEntries.filter((e) => e.settled)
      const activeEntries = allEntries.filter((e) => !e.settled)
      const settledTotal = settledEntries.reduce((sum, e) => sum + e.amount, 0)

      if (settleRes.status === 200) {
        // If settle won, its reported settledAmount must equal EXACTLY the
        // sum of entries actually marked settled=true — never less (an
        // unaccounted-for swept-in entry) and never more.
        expect(settleBody.settledAmount).toBe(settledTotal)
        expect(settleBody.settledCount).toBe(settledEntries.length)
      } else {
        // If settle lost (rolled back via the count-mismatch guard), NOTHING
        // may be marked settled — the raced-in entry must remain active,
        // not silently absorbed.
        expect(settleRes.status).toBe(409)
        expect(settledEntries).toHaveLength(0)
        expect(activeEntries).toHaveLength(2)
      }
    })
  }
)
