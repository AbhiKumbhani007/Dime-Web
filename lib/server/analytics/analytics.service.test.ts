import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  getOverview,
  getByPeriod,
  getByCategory,
  getTrends,
  getTopDays,
  getBudgetVsActual,
} from './analytics.service'
import { listBudgets } from '@/lib/server/budgets/budgets.service'

vi.mock('@/lib/server/budgets/budgets.service', () => ({
  listBudgets: vi.fn(),
}))

function createMockPrisma() {
  return {
    transaction: {
      groupBy: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
  } as unknown as PrismaClient & {
    transaction: {
      groupBy: ReturnType<typeof vi.fn>
      count: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
    }
    category: { findMany: ReturnType<typeof vi.fn> }
  }
}

const USER = 'user1'

describe('getOverview', () => {
  it('computes totals, net balance, count, and avg daily spend over the resolved range', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.groupBy.mockResolvedValue([
      { isIncome: true, _sum: { amount: 50000 } },
      { isIncome: false, _sum: { amount: 30000 } },
    ])
    prisma.transaction.count.mockResolvedValue(12)

    const from = new Date(2026, 3, 1)
    const to = new Date(2026, 3, 30, 23, 59, 59, 999)
    const result = await getOverview(prisma, USER, { from, to })

    expect(result.totalIncome).toBe(50000)
    expect(result.totalExpense).toBe(30000)
    expect(result.netBalance).toBe(20000)
    expect(result.transactionCount).toBe(12)
    expect(result.avgDailySpend).toBe(1000) // 30000 / 30 days
    expect(result.from).toBe(from.toISOString())
    expect(result.to).toBe(to.toISOString())
  })

  it('defaults missing income/expense groups to zero', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.groupBy.mockResolvedValue([])
    prisma.transaction.count.mockResolvedValue(0)

    const result = await getOverview(prisma, USER, {}, new Date(2026, 3, 15))

    expect(result.totalIncome).toBe(0)
    expect(result.totalExpense).toBe(0)
    expect(result.netBalance).toBe(0)
    expect(result.avgDailySpend).toBe(0)
  })

  it('defaults an omitted from/to to epoch/now', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.groupBy.mockResolvedValue([])
    prisma.transaction.count.mockResolvedValue(0)
    const now = new Date(2026, 3, 15)

    const result = await getOverview(prisma, USER, {}, now)

    expect(result.from).toBe(new Date(0).toISOString())
    expect(result.to).toBe(now.toISOString())
    expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: new Date(0), lte: now },
        }),
      })
    )
  })
})

describe('getByPeriod', () => {
  it('sums income and expense into the right weekly buckets', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([
      { amount: 1000, isIncome: true, date: new Date(2026, 3, 15) }, // Wed
      { amount: 150, isIncome: false, date: new Date(2026, 3, 13) }, // Mon
      { amount: 300, isIncome: false, date: new Date(2026, 3, 16) }, // Thu
    ])

    const result = await getByPeriod(prisma, USER, {
      period: 'weekly',
      date: new Date(2026, 3, 15),
    })

    expect(result.period).toBe('weekly')
    expect(result.labels).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ])
    expect(result.income).toEqual([0, 0, 1000, 0, 0, 0, 0])
    expect(result.expense).toEqual([150, 0, 0, 300, 0, 0, 0])
    expect(result.net).toEqual([-150, 0, 1000, -300, 0, 0, 0])
  })

  it('filters by categoryId when given', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    await getByPeriod(prisma, USER, {
      period: 'monthly',
      date: new Date(2026, 3, 15),
      categoryId: 'cat1',
    })

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: 'cat1' }),
      })
    )
  })

  it('defaults the reference date to now when omitted', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])
    const now = new Date(2026, 3, 15)

    const result = await getByPeriod(prisma, USER, { period: 'monthly' }, now)

    expect(result.labels).toHaveLength(30) // April has 30 days
  })
})

describe('getByCategory', () => {
  it('groups by category, computing percentages that sum to 100', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.groupBy.mockResolvedValue([
      { categoryId: 'cat1', _sum: { amount: 750 }, _count: 3 },
      { categoryId: 'cat2', _sum: { amount: 250 }, _count: 1 },
    ])
    prisma.category.findMany.mockResolvedValue([
      { id: 'cat1', name: 'Food', emoji: '🍔', color: '#f97316' },
      { id: 'cat2', name: 'Transport', emoji: '🚌', color: '#3b82f6' },
    ])

    const rows = await getByCategory(prisma, USER, {})

    expect(rows).toHaveLength(2)
    expect(rows.reduce((sum, r) => sum + r.percent, 0)).toBeCloseTo(100, 1)
    const food = rows.find((r) => r.category?.id === 'cat1')
    expect(food?.percent).toBe(75)
    expect(food?.count).toBe(3)
  })

  it('passes isIncome through as a where filter when given', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.groupBy.mockResolvedValue([])
    prisma.category.findMany.mockResolvedValue([])

    await getByCategory(prisma, USER, { isIncome: true })

    expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isIncome: true }),
      })
    )
  })

  it('returns category: null for a categoryId no longer found', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.groupBy.mockResolvedValue([
      { categoryId: 'gone', _sum: { amount: 100 }, _count: 1 },
    ])
    prisma.category.findMany.mockResolvedValue([])

    const [row] = await getByCategory(prisma, USER, {})
    expect(row.category).toBeNull()
  })

  it('scopes the category lookup by userId, not just by id', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.groupBy.mockResolvedValue([
      { categoryId: 'cat1', _sum: { amount: 100 }, _count: 1 },
    ])
    prisma.category.findMany.mockResolvedValue([])

    await getByCategory(prisma, USER, {})

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER }),
      })
    )
  })

  it('returns [] without querying categories when there is no spend', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.groupBy.mockResolvedValue([])

    const rows = await getByCategory(prisma, USER, {})

    expect(rows).toEqual([])
    expect(prisma.category.findMany).not.toHaveBeenCalled()
  })
})

describe('getTrends', () => {
  it('returns the last N months, oldest first, with correct sums', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([
      { amount: 500, isIncome: false, date: new Date(2026, 2, 10) },
      { amount: 2000, isIncome: true, date: new Date(2026, 3, 5) },
      { amount: 800, isIncome: false, date: new Date(2026, 3, 20) },
    ])

    const rows = await getTrends(
      prisma,
      USER,
      { months: 2 },
      new Date(2026, 3, 15)
    )

    expect(rows).toEqual([
      { month: '2026-03', income: 0, expense: 500, net: -500 },
      { month: '2026-04', income: 2000, expense: 800, net: 1200 },
    ])
  })
})

describe('getTopDays', () => {
  it('sums expenses per day, sorted descending, capped at limit', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([
      { amount: 100, date: new Date(2026, 3, 1) },
      { amount: 900, date: new Date(2026, 3, 7) },
      { amount: 50, date: new Date(2026, 3, 1) },
    ])

    const rows = await getTopDays(prisma, USER, { limit: 1 })

    expect(rows).toEqual([{ date: '2026-04-07', total: 900 }])
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isIncome: false }),
      })
    )
  })
})

describe('getBudgetVsActual', () => {
  it('maps listBudgets rows into the narrower BudgetVsActualRow shape', async () => {
    const prisma = createMockPrisma()
    vi.mocked(listBudgets).mockResolvedValue([
      {
        id: 'b1',
        name: 'Groceries',
        emoji: '🛒',
        type: 'MONTHLY',
        amount: 10000,
        spent: 4000,
        remaining: 6000,
        percent: 40,
        daysRemaining: 10,
        periodStart: '2026-04-01T00:00:00.000Z',
        periodEnd: '2026-04-30T23:59:59.999Z',
      } as never,
    ])

    const rows = await getBudgetVsActual(prisma, USER)

    expect(rows).toEqual([
      {
        budget: { id: 'b1', name: 'Groceries', emoji: '🛒', type: 'MONTHLY' },
        allocated: 10000,
        spent: 4000,
        remaining: 6000,
        percent: 40,
      },
    ])
  })
})
