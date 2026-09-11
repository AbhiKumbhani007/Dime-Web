// @vitest-environment node
//
// Adversarial ledger tests against a REAL Postgres database (not a mocked
// PrismaClient) — see ledgerDbTestHelpers.ts for why/how. These exercise
// exactly what ledger.service.test.ts's mocked unit tests structurally
// cannot: whether computeBalances()'s DB-side `groupBy` SUM aggregation and
// settlePerson()'s JS-side netOf() array summation actually agree on the
// same underlying rows, cascade-delete behavior, userId cross-user
// isolation under real concurrent tenants, and correctness/perf at a
// realistic scale (hundreds of entries).
//
// Skips entirely (never fails) when no real Postgres is reachable — see
// ledgerDbTestHelpers.ts's isLedgerTestDbAvailable(). Every row this file
// creates is scoped under uniquely-namespaced test users and cleaned up via
// cascade-deleting those users in afterAll, so repeated runs never
// accumulate garbage in the shared local dev database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  isLedgerTestDbAvailable,
  loadLedgerTestEnv,
} from './ledgerDbTestHelpers'
import { CreateEntryBodySchema } from './ledger.schema'

loadLedgerTestEnv()

const dbAvailable = await isLedgerTestDbAvailable()

describe.skipIf(!dbAvailable)(
  'ledger money integrity against a real Postgres DB',
  () => {
    let prisma: PrismaClient
    let ledgerService: typeof import('./ledger.service')
    const createdUserIds: string[] = []

    const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    async function makeUser(label: string): Promise<string> {
      const user = await prisma.user.create({
        data: {
          email: `ledger-integrity-${RUN_ID}-${label}@ticket-test.local`,
        },
      })
      createdUserIds.push(user.id)
      return user.id
    }

    beforeAll(async () => {
      ;({ prisma } = await import('@/lib/server/prisma'))
      ledgerService = await import('./ledger.service')
    })

    afterAll(async () => {
      // User delete cascades LedgerPerson -> LedgerEntry (onDelete: Cascade
      // in schema.prisma) — the same mechanism the "delete cascades"
      // test below verifies explicitly for a single person.
      for (const id of createdUserIds) {
        await prisma.user.delete({ where: { id } }).catch(() => {})
      }
    })

    it('hundreds of float-prone entries: computeBalances (DB-side SUM) and settlePerson (JS-side netOf) agree exactly, so a client that settles using the balance GET just returned never gets a false 409', async () => {
      const userId = await makeUser('scale')
      const person = await ledgerService.createPerson(prisma, userId, {
        name: 'Scale Test Person',
        color: '#6366f1',
      } as never)

      // 320 entries mixing amounts specifically chosen to be float-adversarial
      // (recurring binary fractions: 0.10, 0.20, 0.70) plus a couple of
      // large/oddball ones, alternating GAVE/RECEIVED with a deliberate skew
      // so the net isn't trivially zero.
      const amountsCents = [10, 20, 70, 333, 999999]
      let expectedCents = 0
      const date = new Date('2026-01-01T00:00:00.000Z')
      for (let i = 0; i < 64; i++) {
        for (const cents of amountsCents) {
          const type = i % 4 === 0 ? 'RECEIVED' : 'GAVE'
          await ledgerService.createEntry(prisma, userId, person.id, {
            amount: cents / 100,
            type,
            date,
          } as never)
          expectedCents += type === 'GAVE' ? cents : -cents
        }
      }
      const expectedBalance = Math.round(expectedCents) / 100

      // Path 1: DB-side groupBy SUM, via the same route the list/detail
      // endpoints use.
      const { people } = await ledgerService.listPeople(prisma, userId)
      const listed = people.find((p) => p.id === person.id)
      expect(listed).toBeDefined()
      expect(listed?.balance).toBe(expectedBalance)
      expect(listed?.activeEntryCount).toBe(320)

      // Path 2: settlePerson's JS-side netOf() over individually-fetched
      // active rows — must accept the exact balance path 1 reported, with
      // zero tolerance slack needed beyond EPSILON, proving the two
      // summation strategies never disagree even at this scale.
      const settleResult = await ledgerService.settlePerson(
        prisma,
        userId,
        person.id,
        { expectedBalance: listed!.balance }
      )
      expect(settleResult.settledCount).toBe(320)
      expect(settleResult.settledAmount).toBe(Math.abs(expectedBalance))

      const { people: after } = await ledgerService.listPeople(prisma, userId)
      const afterPerson = after.find((p) => p.id === person.id)
      expect(afterPerson?.balance).toBe(0)
      expect(afterPerson?.direction).toBe('SETTLED')
      expect(afterPerson?.activeEntryCount).toBe(0)
      expect(afterPerson?.settledEntryCount).toBe(320)
    }, 30_000)

    it('a person whose active entries net to exactly zero still shows activeEntryCount > 0 (balance=0 does not auto-settle entries)', async () => {
      const userId = await makeUser('zero-balance')
      const person = await ledgerService.createPerson(prisma, userId, {
        name: 'Zero Balance Person',
        color: '#6366f1',
      } as never)
      const date = new Date('2026-02-01T00:00:00.000Z')
      await ledgerService.createEntry(prisma, userId, person.id, {
        amount: 100,
        type: 'GAVE',
        date,
      } as never)
      await ledgerService.createEntry(prisma, userId, person.id, {
        amount: 100,
        type: 'RECEIVED',
        date,
      } as never)

      const fetched = await ledgerService.getPerson(prisma, userId, person.id)
      expect(fetched.balance).toBe(0)
      expect(fetched.direction).toBe('SETTLED')
      expect(fetched.activeEntryCount).toBe(2) // still unsettled, just net-zero
      expect(fetched.settledEntryCount).toBe(0)

      // Settling a net-zero-balance person with outstanding active entries
      // must still succeed (there IS something to settle) and report a
      // zero settledAmount, not error out.
      const result = await ledgerService.settlePerson(
        prisma,
        userId,
        person.id,
        undefined
      )
      expect(result.settledCount).toBe(2)
      expect(result.settledAmount).toBe(0)
    })

    it('deleting an ACTIVE entry recomputes the balance to exclude it; deleting a SETTLED entry leaves the balance untouched but drops settledEntryCount', async () => {
      const userId = await makeUser('delete-entry')
      const person = await ledgerService.createPerson(prisma, userId, {
        name: 'Delete Entry Person',
        color: '#6366f1',
      } as never)
      const date = new Date('2026-03-01T00:00:00.000Z')

      const active1 = await ledgerService.createEntry(
        prisma,
        userId,
        person.id,
        {
          amount: 500,
          type: 'GAVE',
          date,
        } as never
      )
      const active2 = await ledgerService.createEntry(
        prisma,
        userId,
        person.id,
        {
          amount: 200,
          type: 'GAVE',
          date,
        } as never
      )

      let fetched = await ledgerService.getPerson(prisma, userId, person.id)
      expect(fetched.balance).toBe(700)

      // Delete one of the two active entries — balance must drop by exactly
      // that entry's signed amount.
      await ledgerService.deleteEntry(prisma, userId, active1.entry.id)
      fetched = await ledgerService.getPerson(prisma, userId, person.id)
      expect(fetched.balance).toBe(200)
      expect(fetched.activeEntryCount).toBe(1)

      // Settle the remaining active entry, then delete it now that it's
      // settled — balance (already 0 post-settle) must remain 0, and
      // settledEntryCount must drop.
      await ledgerService.settlePerson(prisma, userId, person.id, undefined)
      fetched = await ledgerService.getPerson(prisma, userId, person.id)
      expect(fetched.settledEntryCount).toBe(1)
      expect(fetched.balance).toBe(0)

      await ledgerService.deleteEntry(prisma, userId, active2.entry.id)
      fetched = await ledgerService.getPerson(prisma, userId, person.id)
      expect(fetched.balance).toBe(0) // unchanged — it was already excluded
      expect(fetched.settledEntryCount).toBe(0)
      expect(fetched.activeEntryCount).toBe(0)

      // No orphan row left behind for the deleted settled entry.
      const orphan = await prisma.ledgerEntry.findUnique({
        where: { id: active2.entry.id },
      })
      expect(orphan).toBeNull()
    })

    it('deleting a person cascades its entries — no orphaned LedgerEntry rows remain queryable by any path afterward', async () => {
      const userId = await makeUser('cascade')
      const person = await ledgerService.createPerson(prisma, userId, {
        name: 'Cascade Delete Person',
        color: '#6366f1',
      } as never)
      const date = new Date('2026-04-01T00:00:00.000Z')

      const e1 = await ledgerService.createEntry(prisma, userId, person.id, {
        amount: 300,
        type: 'GAVE',
        date,
      } as never)
      const e2 = await ledgerService.createEntry(prisma, userId, person.id, {
        amount: 150,
        type: 'RECEIVED',
        date,
      } as never)
      await ledgerService.settlePerson(prisma, userId, person.id, undefined)

      await ledgerService.deletePerson(prisma, userId, person.id)

      // Direct DB query, bypassing the service layer entirely — proves the
      // cascade actually removed the rows, not just that the service's own
      // 404-on-missing-person masks stale entries.
      const remaining = await prisma.ledgerEntry.findMany({
        where: { personId: person.id },
      })
      expect(remaining).toHaveLength(0)

      const remainingByUser = await prisma.ledgerEntry.findMany({
        where: { userId, id: { in: [e1.entry.id, e2.entry.id] } },
      })
      expect(remainingByUser).toHaveLength(0)

      // The person itself is gone too.
      await expect(
        ledgerService.getPerson(prisma, userId, person.id)
      ).rejects.toMatchObject({ statusCode: 404 })
    })

    it("cross-user isolation: two users with identically-named people and identical amounts never leak into each other's balance or summary", async () => {
      const userA = await makeUser('cross-a')
      const userB = await makeUser('cross-b')
      const date = new Date('2026-05-01T00:00:00.000Z')

      const personA = await ledgerService.createPerson(prisma, userA, {
        name: 'Shared Name',
        color: '#6366f1',
      } as never)
      const personB = await ledgerService.createPerson(prisma, userB, {
        name: 'Shared Name', // identical name — different user, must not 409
        color: '#6366f1',
      } as never)

      await ledgerService.createEntry(prisma, userA, personA.id, {
        amount: 1000,
        type: 'GAVE',
        date,
      } as never)
      await ledgerService.createEntry(prisma, userB, personB.id, {
        amount: 1000, // identical amount, different tenant
        type: 'GAVE',
        date,
      } as never)

      const { people: peopleA, summary: summaryA } =
        await ledgerService.listPeople(prisma, userA)
      const { people: peopleB, summary: summaryB } =
        await ledgerService.listPeople(prisma, userB)

      expect(peopleA).toHaveLength(1)
      expect(peopleB).toHaveLength(1)
      expect(peopleA[0]?.balance).toBe(1000) // not 2000 — no cross-tenant sum
      expect(peopleB[0]?.balance).toBe(1000)
      expect(summaryA.youAreOwed).toBe(1000)
      expect(summaryB.youAreOwed).toBe(1000)

      // A can never fetch B's person by id, even though the name collides.
      await expect(
        ledgerService.getPerson(prisma, userA, personB.id)
      ).rejects.toMatchObject({ statusCode: 404 })
      await expect(
        ledgerService.getPerson(prisma, userB, personA.id)
      ).rejects.toMatchObject({ statusCode: 404 })

      // computeBalances scoped to specific personIds must not cross-leak
      // either, exercising the personIds-array code path directly (used by
      // the single-person detail route).
      const scoped = await ledgerService.getPerson(prisma, userA, personA.id)
      expect(scoped.balance).toBe(1000)
    })

    it('AmountSchema (the sole gate against invalid amounts) rejects zero, negative, and >2-decimal values, and accepts exactly the documented ceiling', () => {
      const base = { type: 'GAVE' as const, date: new Date() }
      expect(
        CreateEntryBodySchema.safeParse({ ...base, amount: 0 }).success
      ).toBe(false)
      expect(
        CreateEntryBodySchema.safeParse({ ...base, amount: -0.01 }).success
      ).toBe(false)
      expect(
        CreateEntryBodySchema.safeParse({ ...base, amount: 10.001 }).success
      ).toBe(false)
      expect(
        CreateEntryBodySchema.safeParse({ ...base, amount: 1_000_000_000 })
          .success
      ).toBe(true)
      expect(
        CreateEntryBodySchema.safeParse({ ...base, amount: 1_000_000_000.01 })
          .success
      ).toBe(false)
    })

    it('the service layer itself has no amount guard beyond the schema — a negative amount handed directly to createEntry (bypassing validation) is persisted as-is and still nets correctly, rather than corrupting or crashing computeBalances', async () => {
      // Not exploitable through any real route (CreateEntryBodySchema always
      // runs first in app/api/ledger/people/[id]/entries/route.ts) — this
      // documents that createEntry() itself trusts its caller completely,
      // matching every other service function in this module (no
      // defense-in-depth re-validation), and confirms the balance math
      // degrades gracefully (stays arithmetically consistent) rather than
      // throwing if a negative amount ever reached the DB some other way
      // (a bad migration, a manual DB edit, a future caller that forgets to
      // validate).
      const userId = await makeUser('negative-bypass')
      const person = await ledgerService.createPerson(prisma, userId, {
        name: 'Negative Bypass Person',
        color: '#6366f1',
      } as never)

      await ledgerService.createEntry(prisma, userId, person.id, {
        amount: -50, // bypasses AmountSchema entirely — direct service call
        type: 'GAVE',
        date: new Date(),
      } as never)

      const fetched = await ledgerService.getPerson(prisma, userId, person.id)
      // GAVE -50 nets the same as RECEIVED 50 would: balance -50, YOU_OWE.
      expect(fetched.balance).toBe(-50)
      expect(fetched.direction).toBe('YOU_OWE')
    })
  }
)
