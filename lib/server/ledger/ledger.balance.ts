import 'server-only'
import type { PrismaClient } from '@prisma/client'

export type LedgerDirection = 'OWED_TO_YOU' | 'YOU_OWE' | 'SETTLED'
export type LedgerEntryType = 'GAVE' | 'RECEIVED'

export interface LedgerPersonDTO {
  id: string
  name: string
  phone: string | null
  note: string | null
  color: string
  balance: number
  direction: LedgerDirection
  activeEntryCount: number
  settledEntryCount: number
  lastActivityAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LedgerSummary {
  youAreOwed: number
  youOwe: number
  netPosition: number
  personCount: number
  settledPeople: number
  settledEntries: number
}

export interface LedgerEntryDTO {
  id: string
  amount: number
  type: LedgerEntryType
  date: string
  note: string | null
  settled: boolean
  settledAt: string | null
  personId: string
  createdAt: string
  updatedAt: string
}

// Half a paisa — guards against Float accumulation error, not a real amount.
export const EPSILON = 0.005

// GAVE = you handed money over → their debt goes up (+).
// RECEIVED = they paid you back → down (−).
// balance > 0: they owe you. balance < 0: you owe them. 0: settled.
export function netBalance(gave: number, received: number): number {
  return Math.round((gave - received) * 100) / 100
}

export function netOf(
  entries: Array<{ amount: number; type: LedgerEntryType }>
): number {
  let gave = 0
  let received = 0
  for (const entry of entries) {
    if (entry.type === 'GAVE') gave += entry.amount
    else received += entry.amount
  }
  return netBalance(gave, received)
}

export function directionOf(balance: number): LedgerDirection {
  if (balance > EPSILON) return 'OWED_TO_YOU'
  if (balance < -EPSILON) return 'YOU_OWE'
  return 'SETTLED'
}

export function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON
}

// Sums the already-computed per-person array — never recomputed independently,
// so the summary banner can't arithmetically disagree with the per-person cards.
export function summarise(
  people: Array<
    Pick<LedgerPersonDTO, 'balance' | 'direction' | 'settledEntryCount'>
  >
): LedgerSummary {
  let youAreOwed = 0
  let youOwe = 0
  let settledPeople = 0
  let settledEntries = 0

  for (const person of people) {
    if (person.balance > 0) youAreOwed += person.balance
    else if (person.balance < 0) youOwe += Math.abs(person.balance)
    if (person.direction === 'SETTLED') settledPeople += 1
    settledEntries += person.settledEntryCount
  }

  return {
    youAreOwed: Math.round(youAreOwed * 100) / 100,
    youOwe: Math.round(youOwe * 100) / 100,
    netPosition: Math.round((youAreOwed - youOwe) * 100) / 100,
    personCount: people.length,
    settledPeople,
    settledEntries,
  }
}

/**
 * Fetch people (optionally scoped to `personIds`) and their computed balances
 * in 4 parallel queries merged in JS, rather than N+1 per-person queries.
 */
export async function computeBalances(
  prisma: PrismaClient,
  userId: string,
  personIds?: string[]
): Promise<LedgerPersonDTO[]> {
  const personFilter = personIds ? { id: { in: personIds } } : {}
  const entryFilter = personIds ? { personId: { in: personIds } } : {}

  const [people, activeRows, settledRows, lastActivityRows] = await Promise.all(
    [
      prisma.ledgerPerson.findMany({
        where: { userId, ...personFilter },
        orderBy: [{ name: 'asc' }],
      }),
      // The only place settled entries are excluded from the balance calculation.
      prisma.ledgerEntry.groupBy({
        by: ['personId', 'type'],
        where: { userId, settled: false, ...entryFilter },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ['personId'],
        where: { userId, settled: true, ...entryFilter },
        _count: { _all: true },
      }),
      // Last activity spans both settled and unsettled entries.
      prisma.ledgerEntry.groupBy({
        by: ['personId'],
        where: { userId, ...entryFilter },
        _max: { date: true },
      }),
    ]
  )

  const activeByPerson = new Map<
    string,
    { gave: number; received: number; count: number }
  >()
  for (const row of activeRows) {
    const acc = activeByPerson.get(row.personId) ?? {
      gave: 0,
      received: 0,
      count: 0,
    }
    const sum = row._sum.amount ?? 0
    if (row.type === 'GAVE') acc.gave += sum
    else acc.received += sum
    acc.count += row._count._all
    activeByPerson.set(row.personId, acc)
  }

  const settledByPerson = new Map(
    settledRows.map((row) => [row.personId, row._count._all])
  )
  const lastActivityByPerson = new Map(
    lastActivityRows.map((row) => [row.personId, row._max.date])
  )

  return people.map((person) => {
    const active = activeByPerson.get(person.id) ?? {
      gave: 0,
      received: 0,
      count: 0,
    }
    const balance = netBalance(active.gave, active.received)
    const lastActivityAt = lastActivityByPerson.get(person.id) ?? null

    return {
      id: person.id,
      name: person.name,
      phone: person.phone,
      note: person.note,
      color: person.color,
      balance,
      direction: directionOf(balance),
      activeEntryCount: active.count,
      settledEntryCount: settledByPerson.get(person.id) ?? 0,
      lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
    }
  })
}
