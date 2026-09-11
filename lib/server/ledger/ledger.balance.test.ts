import { describe, it, expect, vi } from 'vitest'
import {
  netBalance,
  netOf,
  directionOf,
  amountsEqual,
  summarise,
  computeBalances,
  EPSILON,
  type LedgerPersonDTO,
} from './ledger.balance'

describe('netBalance', () => {
  it('GAVE-only → positive (they owe you)', () => {
    expect(netBalance(500, 0)).toBe(500)
  })

  it('RECEIVED-only → negative (you owe them)', () => {
    expect(netBalance(0, 200)).toBe(-200)
  })

  it('asymmetric mixed: gave 500, received 200 → +300', () => {
    expect(netBalance(500, 200)).toBe(300)
  })

  it('the mirror of the above: gave 200, received 500 → -300 (catches a sign flip)', () => {
    expect(netBalance(200, 500)).toBe(-300)
  })

  it('exact zero when gave equals received', () => {
    expect(netBalance(300, 300)).toBe(0)
  })
})

describe('netOf', () => {
  it('sums a raw entry array the same way netBalance does', () => {
    const entries: Array<{ amount: number; type: 'GAVE' | 'RECEIVED' }> = [
      { amount: 500, type: 'GAVE' },
      { amount: 200, type: 'RECEIVED' },
    ]
    expect(netOf(entries)).toBe(300)
  })

  it('only sums entries actually passed in — callers must exclude settled entries themselves', () => {
    const active = [{ amount: 100, type: 'GAVE' as const }]
    const settled = [{ amount: 9000, type: 'RECEIVED' as const }]
    expect(netOf(active)).toBe(100)
    expect(netOf([...active, ...settled])).not.toBe(100)
  })
})

describe('directionOf', () => {
  it('positive balance → OWED_TO_YOU', () => {
    expect(directionOf(300)).toBe('OWED_TO_YOU')
  })

  it('negative balance → YOU_OWE', () => {
    expect(directionOf(-300)).toBe('YOU_OWE')
  })

  it('exact zero → SETTLED', () => {
    expect(directionOf(0)).toBe('SETTLED')
  })

  it('float drift within EPSILON still reads as SETTLED', () => {
    expect(directionOf(EPSILON / 2)).toBe('SETTLED')
    expect(directionOf(-EPSILON / 2)).toBe('SETTLED')
  })

  it('just outside EPSILON is not SETTLED', () => {
    expect(directionOf(EPSILON * 2)).toBe('OWED_TO_YOU')
    expect(directionOf(-EPSILON * 2)).toBe('YOU_OWE')
  })
})

describe('amountsEqual', () => {
  it('treats values within EPSILON as equal', () => {
    expect(amountsEqual(100, 100 + EPSILON / 2)).toBe(true)
  })

  it('treats values outside EPSILON as different', () => {
    expect(amountsEqual(100, 101)).toBe(false)
  })
})

describe('summarise', () => {
  function person(
    overrides: Partial<LedgerPersonDTO> = {}
  ): Pick<LedgerPersonDTO, 'balance' | 'direction' | 'settledEntryCount'> {
    return {
      balance: 0,
      direction: 'SETTLED',
      settledEntryCount: 0,
      ...overrides,
    }
  }

  it('netPosition always equals the sum of per-person balances', () => {
    const people = [
      person({ balance: 300, direction: 'OWED_TO_YOU' }),
      person({ balance: -120, direction: 'YOU_OWE' }),
      person({ balance: 0, direction: 'SETTLED' }),
    ]
    const summary = summarise(people)
    const expectedNet = people.reduce((sum, p) => sum + p.balance, 0)
    expect(summary.netPosition).toBeCloseTo(expectedNet, 5)
    expect(summary.youAreOwed).toBe(300)
    expect(summary.youOwe).toBe(120)
  })

  it('counts settled people and sums settledEntryCount', () => {
    const people = [
      person({ balance: 0, direction: 'SETTLED', settledEntryCount: 2 }),
      person({ balance: 50, direction: 'OWED_TO_YOU', settledEntryCount: 1 }),
    ]
    const summary = summarise(people)
    expect(summary.settledPeople).toBe(1)
    expect(summary.settledEntries).toBe(3)
    expect(summary.personCount).toBe(2)
  })

  it('empty list → all zeros', () => {
    const summary = summarise([])
    expect(summary).toEqual({
      youAreOwed: 0,
      youOwe: 0,
      netPosition: 0,
      personCount: 0,
      settledPeople: 0,
      settledEntries: 0,
    })
  })
})

// ─── computeBalances: settled entries must be excluded from the active balance ─
describe('computeBalances', () => {
  function makeMockPrisma() {
    return {
      ledgerPerson: {
        findMany: vi.fn(),
      },
      ledgerEntry: {
        groupBy: vi.fn(),
      },
    }
  }

  it('queries active entries with settled:false and excludes settled amounts from the balance', async () => {
    const prisma = makeMockPrisma()
    const now = new Date('2026-01-01T00:00:00.000Z')

    prisma.ledgerPerson.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Alex',
        phone: null,
        note: null,
        color: '#6366f1',
        userId: 'user1',
        createdAt: now,
        updatedAt: now,
      },
    ])

    // groupBy call order: activeRows, settledRows, lastActivityRows
    prisma.ledgerEntry.groupBy
      .mockResolvedValueOnce([
        {
          personId: 'p1',
          type: 'GAVE',
          _sum: { amount: 100 },
          _count: { _all: 1 },
        },
      ])
      .mockResolvedValueOnce([{ personId: 'p1', _count: { _all: 5 } }])
      .mockResolvedValueOnce([{ personId: 'p1', _max: { date: now } }])

    const [person] = await computeBalances(prisma as never, 'user1')

    expect(person.balance).toBe(100)
    expect(person.activeEntryCount).toBe(1)
    expect(person.settledEntryCount).toBe(5)

    // The active-entry query must scope settled:false explicitly, and by userId.
    const activeCallArgs = prisma.ledgerEntry.groupBy.mock.calls[0]?.[0]
    expect(activeCallArgs.where.settled).toBe(false)
    expect(activeCallArgs.where.userId).toBe('user1')

    // The settled-count query scopes settled:true — a large settled sum must
    // never leak into the active balance above.
    const settledCallArgs = prisma.ledgerEntry.groupBy.mock.calls[1]?.[0]
    expect(settledCallArgs.where.settled).toBe(true)

    // The person query itself must be scoped by userId too, not just id.
    const personCallArgs = prisma.ledgerPerson.findMany.mock.calls[0]?.[0]
    expect(personCallArgs.where.userId).toBe('user1')
  })

  it('a person with only settled entries has a zero active balance', async () => {
    const prisma = makeMockPrisma()
    const now = new Date('2026-01-01T00:00:00.000Z')

    prisma.ledgerPerson.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Alex',
        phone: null,
        note: null,
        color: '#6366f1',
        userId: 'user1',
        createdAt: now,
        updatedAt: now,
      },
    ])
    // No active rows at all — everything for this person has been settled.
    prisma.ledgerEntry.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ personId: 'p1', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ personId: 'p1', _max: { date: now } }])

    const [person] = await computeBalances(prisma as never, 'user1')

    expect(person.balance).toBe(0)
    expect(person.direction).toBe('SETTLED')
    expect(person.activeEntryCount).toBe(0)
    expect(person.settledEntryCount).toBe(3)
  })

  it('accumulates GAVE and RECEIVED active rows for the same person into one net balance', async () => {
    const prisma = makeMockPrisma()
    const now = new Date('2026-01-01T00:00:00.000Z')

    prisma.ledgerPerson.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Alex',
        phone: null,
        note: null,
        color: '#6366f1',
        userId: 'user1',
        createdAt: now,
        updatedAt: now,
      },
    ])
    // Both an active GAVE row and an active RECEIVED row for the same person —
    // the accumulator must add to `gave` for one and to `received` for the
    // other, not just exercise the GAVE branch (which every other fixture in
    // this file happens to use).
    prisma.ledgerEntry.groupBy
      .mockResolvedValueOnce([
        {
          personId: 'p1',
          type: 'GAVE',
          _sum: { amount: 500 },
          _count: { _all: 1 },
        },
        {
          personId: 'p1',
          type: 'RECEIVED',
          _sum: { amount: 200 },
          _count: { _all: 1 },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ personId: 'p1', _max: { date: now } }])

    const [person] = await computeBalances(prisma as never, 'user1')

    expect(person.balance).toBe(300) // 500 gave - 200 received
    expect(person.activeEntryCount).toBe(2)
  })

  it('scopes to the given personIds when provided, without dropping the userId scope', async () => {
    const prisma = makeMockPrisma()
    prisma.ledgerPerson.findMany.mockResolvedValue([])
    prisma.ledgerEntry.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await computeBalances(prisma as never, 'user1', ['p1', 'p2'])

    const personCallArgs = prisma.ledgerPerson.findMany.mock.calls[0]?.[0]
    expect(personCallArgs.where).toEqual({
      userId: 'user1',
      id: { in: ['p1', 'p2'] },
    })

    const activeCallArgs = prisma.ledgerEntry.groupBy.mock.calls[0]?.[0]
    expect(activeCallArgs.where).toEqual({
      userId: 'user1',
      settled: false,
      personId: { in: ['p1', 'p2'] },
    })
  })
})
