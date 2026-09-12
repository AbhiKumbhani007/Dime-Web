import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  listPeople,
  createPerson,
  getPerson,
  updatePerson,
  deletePerson,
  listPersonEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  settlePerson,
} from './ledger.service'

function createMockPrisma() {
  const prisma = {
    ledgerPerson: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    ledgerEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  // Runs the callback against the same mock object, so `tx.*` inside a
  // transaction resolves via the same mocks as everywhere else — matches
  // transactions.service.test.ts's identical pattern.
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(prisma)
  )
  return prisma as unknown as PrismaClient & {
    ledgerPerson: {
      findMany: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
    ledgerEntry: {
      findMany: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
      updateMany: ReturnType<typeof vi.fn>
      groupBy: ReturnType<typeof vi.fn>
    }
    $transaction: ReturnType<typeof vi.fn>
  }
}

type MockPrisma = ReturnType<typeof createMockPrisma>

const USER = 'user1'
const PERSON_ID = 'clperson0000000000000000001'
const ENTRY_ID = 'clentry00000000000000000001'
const NOW = new Date('2026-01-01T00:00:00.000Z')

function makePerson(overrides: Record<string, unknown> = {}) {
  return {
    id: PERSON_ID,
    name: 'Priya',
    phone: null,
    note: null,
    color: '#6366f1',
    userId: USER,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    amount: 500,
    type: 'GAVE',
    date: NOW,
    note: null,
    settled: false,
    settledAt: null,
    personId: PERSON_ID,
    userId: USER,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

// A zero-balance computeBalances() round trip — sufficient for tests that
// assert on routing/validation/ownership, not on balance arithmetic itself
// (that's covered by ledger.balance.test.ts).
function mockZeroBalance(prisma: MockPrisma, people: unknown[]) {
  prisma.ledgerPerson.findMany.mockResolvedValueOnce(people)
  prisma.ledgerEntry.groupBy
    .mockResolvedValueOnce([]) // active sums
    .mockResolvedValueOnce([]) // settled counts
    .mockResolvedValueOnce([]) // last activity
}

describe('listPeople', () => {
  it('returns {people, summary} scoped by userId', async () => {
    const prisma = createMockPrisma()
    mockZeroBalance(prisma, [makePerson()])

    const result = await listPeople(prisma, USER)

    expect(result.people).toHaveLength(1)
    expect(result.summary.personCount).toBe(1)
    expect(prisma.ledgerPerson.findMany.mock.calls[0]?.[0].where.userId).toBe(
      USER
    )
  })
})

describe('createPerson', () => {
  it('creates a person with the default color when omitted', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(null) // no dup
    prisma.ledgerPerson.create.mockResolvedValueOnce(makePerson())
    mockZeroBalance(prisma, [makePerson()])

    const result = await createPerson(prisma, USER, {
      name: 'Priya',
      color: '#6366f1',
    })

    expect(result.name).toBe('Priya')
    expect(prisma.ledgerPerson.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: USER, color: '#6366f1' }),
      })
    )
  })

  it('rejects a case-insensitive duplicate name with a 409 httpError, never calling create', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(
      makePerson({ name: 'priya' })
    )

    await expect(
      createPerson(prisma, USER, { name: 'PRIYA', color: '#6366f1' })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'A person with this name already exists',
    })
    expect(prisma.ledgerPerson.create).not.toHaveBeenCalled()
    const dupCallArgs = prisma.ledgerPerson.findFirst.mock.calls[0]?.[0]
    expect(dupCallArgs.where).toEqual({
      userId: USER,
      name: { equals: 'PRIYA', mode: 'insensitive' },
    })
  })
})

describe('getPerson', () => {
  it('returns the person via computeBalances when owned', async () => {
    const prisma = createMockPrisma()
    mockZeroBalance(prisma, [makePerson()])

    const result = await getPerson(prisma, USER, PERSON_ID)
    expect(result.id).toBe(PERSON_ID)
  })

  it("404s (not silently empty) for another user's person", async () => {
    const prisma = createMockPrisma()
    mockZeroBalance(prisma, []) // computeBalances finds nobody for this id/user

    await expect(getPerson(prisma, USER, PERSON_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Person not found',
    })
  })
})

describe('updatePerson', () => {
  it('404s and never calls update when not owned', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(null)

    await expect(
      updatePerson(prisma, USER, PERSON_ID, { note: 'Roommate' })
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Person not found',
    })
    expect(prisma.ledgerPerson.update).not.toHaveBeenCalled()
  })

  it('updates when owned', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(makePerson()) // ownership check
    prisma.ledgerPerson.update.mockResolvedValueOnce(
      makePerson({ note: 'Roommate' })
    )
    mockZeroBalance(prisma, [makePerson({ note: 'Roommate' })])

    const result = await updatePerson(prisma, USER, PERSON_ID, {
      note: 'Roommate',
    })
    expect(result.note).toBe('Roommate')
  })

  it('phone: null clears the field via a plain data passthrough', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(
      makePerson({ phone: '+911234567890' })
    )
    prisma.ledgerPerson.update.mockResolvedValueOnce(
      makePerson({ phone: null })
    )
    mockZeroBalance(prisma, [makePerson({ phone: null })])

    await updatePerson(prisma, USER, PERSON_ID, { phone: null })

    expect(prisma.ledgerPerson.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phone: null } })
    )
  })

  it('renaming to a name already used by another person → 409, update never called', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst
      .mockResolvedValueOnce(makePerson()) // ownership check passes
      .mockResolvedValueOnce(makePerson({ id: 'other', name: 'Priya' })) // dup check

    await expect(
      updatePerson(prisma, USER, PERSON_ID, { name: 'Priya' })
    ).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(prisma.ledgerPerson.update).not.toHaveBeenCalled()
  })
})

describe('deletePerson', () => {
  it('404s and never deletes when not owned', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(null)

    await expect(deletePerson(prisma, USER, PERSON_ID)).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(prisma.ledgerPerson.delete).not.toHaveBeenCalled()
  })

  it('deletes when owned', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(makePerson())

    await deletePerson(prisma, USER, PERSON_ID)
    expect(prisma.ledgerPerson.delete).toHaveBeenCalledWith({
      where: { id: PERSON_ID },
    })
  })
})

describe('listPersonEntries', () => {
  it('partitions entries into active and settled, alongside the recomputed person', async () => {
    const prisma = createMockPrisma()
    mockZeroBalance(prisma, [makePerson()])
    prisma.ledgerEntry.findMany.mockResolvedValueOnce([
      makeEntry({ id: 'e1', settled: false }),
      makeEntry({ id: 'e2', settled: true, settledAt: NOW }),
    ])

    const result = await listPersonEntries(prisma, USER, PERSON_ID)

    expect(result.active).toHaveLength(1)
    expect(result.settled).toHaveLength(1)
    expect(result.active[0]?.id).toBe('e1')
    expect(result.settled[0]?.id).toBe('e2')
    expect(result.person.id).toBe(PERSON_ID)
    const entryCallArgs = prisma.ledgerEntry.findMany.mock.calls[0]?.[0]
    expect(entryCallArgs.where).toEqual({ personId: PERSON_ID, userId: USER })
  })

  it("404s for another user's person", async () => {
    const prisma = createMockPrisma()
    mockZeroBalance(prisma, [])

    await expect(
      listPersonEntries(prisma, USER, PERSON_ID)
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('createEntry', () => {
  it("404s and never creates when the person isn't owned", async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(null)

    await expect(
      createEntry(prisma, USER, PERSON_ID, {
        amount: 500,
        type: 'GAVE',
        date: NOW,
      })
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled()
  })

  it('creates and returns {entry, person} with the balance recomputed', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(makePerson()) // ownership
    prisma.ledgerEntry.create.mockResolvedValueOnce(makeEntry())
    mockZeroBalance(prisma, [makePerson()])

    const result = await createEntry(prisma, USER, PERSON_ID, {
      amount: 500,
      type: 'GAVE',
      date: NOW,
    })

    expect(result.entry.amount).toBe(500)
    expect(result.person.id).toBe(PERSON_ID)
    expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ personId: PERSON_ID, userId: USER }),
      })
    )
  })
})

describe('updateEntry', () => {
  it("404s and never updates when the entry isn't owned", async () => {
    const prisma = createMockPrisma()
    prisma.ledgerEntry.findFirst.mockResolvedValueOnce(null)

    await expect(
      updateEntry(prisma, USER, ENTRY_ID, { amount: 10 })
    ).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(prisma.ledgerEntry.update).not.toHaveBeenCalled()
  })

  it('updates and returns {entry, person} with the balance recomputed', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerEntry.findFirst.mockResolvedValueOnce(makeEntry())
    prisma.ledgerEntry.update.mockResolvedValueOnce(makeEntry({ amount: 750 }))
    mockZeroBalance(prisma, [makePerson()])

    const result = await updateEntry(prisma, USER, ENTRY_ID, { amount: 750 })

    expect(result.entry.amount).toBe(750)
    expect(result.person.id).toBe(PERSON_ID)
  })

  it('settled: false un-settles the entry and nulls settledAt', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerEntry.findFirst.mockResolvedValueOnce(
      makeEntry({ settled: true, settledAt: NOW })
    )
    prisma.ledgerEntry.update.mockResolvedValueOnce(
      makeEntry({ settled: false, settledAt: null })
    )
    mockZeroBalance(prisma, [makePerson()])

    await updateEntry(prisma, USER, ENTRY_ID, { settled: false })

    expect(prisma.ledgerEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { settled: false, settledAt: null } })
    )
  })

  it('settled: true stamps settledAt to now', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerEntry.findFirst.mockResolvedValueOnce(
      makeEntry({ settled: false })
    )
    prisma.ledgerEntry.update.mockResolvedValueOnce(
      makeEntry({ settled: true, settledAt: NOW })
    )
    mockZeroBalance(prisma, [makePerson()])

    await updateEntry(prisma, USER, ENTRY_ID, { settled: true })

    const updateArgs = prisma.ledgerEntry.update.mock.calls[0]?.[0]
    expect(updateArgs.data.settled).toBe(true)
    expect(updateArgs.data.settledAt).toBeInstanceOf(Date)
  })

  it('omitted settled leaves both settled fields untouched', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerEntry.findFirst.mockResolvedValueOnce(makeEntry())
    prisma.ledgerEntry.update.mockResolvedValueOnce(makeEntry({ amount: 10 }))
    mockZeroBalance(prisma, [makePerson()])

    await updateEntry(prisma, USER, ENTRY_ID, { amount: 10 })

    expect(prisma.ledgerEntry.update).toHaveBeenCalledWith({
      where: { id: ENTRY_ID },
      data: { amount: 10 },
    })
  })
})

describe('deleteEntry', () => {
  it("404s and never deletes when the entry isn't owned", async () => {
    const prisma = createMockPrisma()
    prisma.ledgerEntry.findFirst.mockResolvedValueOnce(null)

    await expect(deleteEntry(prisma, USER, ENTRY_ID)).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(prisma.ledgerEntry.delete).not.toHaveBeenCalled()
  })

  it('deletes when owned', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerEntry.findFirst.mockResolvedValueOnce(makeEntry())

    await deleteEntry(prisma, USER, ENTRY_ID)
    expect(prisma.ledgerEntry.delete).toHaveBeenCalledWith({
      where: { id: ENTRY_ID },
    })
  })
})

describe('settlePerson', () => {
  it("404s and never opens a transaction when the person isn't owned", async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(null)

    await expect(
      settlePerson(prisma, USER, PERSON_ID, undefined)
    ).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('settles every active entry and returns settledCount/settledAmount/settledAt when there is no expectedBalance to check', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(makePerson())
    prisma.ledgerEntry.findMany.mockResolvedValueOnce([
      makeEntry({ amount: 500, type: 'GAVE' }),
      makeEntry({ id: 'e2', amount: 200, type: 'RECEIVED' }),
    ])
    prisma.ledgerEntry.updateMany.mockResolvedValueOnce({ count: 2 })
    mockZeroBalance(prisma, [makePerson()])

    const result = await settlePerson(prisma, USER, PERSON_ID, undefined)

    expect(result.settledCount).toBe(2)
    expect(result.settledAmount).toBe(300) // |500 - 200|
    expect(result.settledAt).toBeTruthy()
    expect(prisma.ledgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: PERSON_ID, userId: USER, settled: false },
        data: expect.objectContaining({ settled: true }),
      })
    )
  })

  it('409s with "No outstanding entries" when there are zero active entries, never calling updateMany', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(makePerson())
    prisma.ledgerEntry.findMany.mockResolvedValueOnce([])

    await expect(
      settlePerson(prisma, USER, PERSON_ID, undefined)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'No outstanding entries to settle',
    })
    expect(prisma.ledgerEntry.updateMany).not.toHaveBeenCalled()
  })

  // ─── The one explicit concurrency guard in this API — proves the 409 fires ──
  it('409s with "This balance changed" when expectedBalance is stale, never calling updateMany', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(makePerson())
    prisma.ledgerEntry.findMany.mockResolvedValueOnce([
      makeEntry({ amount: 500, type: 'GAVE' }),
    ])

    await expect(
      settlePerson(prisma, USER, PERSON_ID, { expectedBalance: 100 })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'This balance changed — reopen the dialog and try again',
    })
    expect(prisma.ledgerEntry.updateMany).not.toHaveBeenCalled()
  })

  it('settles when expectedBalance matches the actual current balance exactly', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(makePerson())
    prisma.ledgerEntry.findMany.mockResolvedValueOnce([
      makeEntry({ amount: 500, type: 'GAVE' }),
    ])
    prisma.ledgerEntry.updateMany.mockResolvedValueOnce({ count: 1 })
    mockZeroBalance(prisma, [makePerson()])

    const result = await settlePerson(prisma, USER, PERSON_ID, {
      expectedBalance: 500,
    })
    expect(result.settledCount).toBe(1)
    expect(prisma.ledgerEntry.updateMany).toHaveBeenCalled()
  })

  it('settles when expectedBalance is within EPSILON of the actual balance (float drift tolerance)', async () => {
    const prisma = createMockPrisma()
    prisma.ledgerPerson.findFirst.mockResolvedValueOnce(makePerson())
    prisma.ledgerEntry.findMany.mockResolvedValueOnce([
      makeEntry({ amount: 500, type: 'GAVE' }),
    ])
    prisma.ledgerEntry.updateMany.mockResolvedValueOnce({ count: 1 })
    mockZeroBalance(prisma, [makePerson()])

    const result = await settlePerson(prisma, USER, PERSON_ID, {
      expectedBalance: 500.001,
    })
    expect(result.settledCount).toBe(1)
  })
})
