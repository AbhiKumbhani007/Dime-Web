import 'server-only'
import type { PrismaClient } from '@prisma/client'
import type {
  AnalyticsPeriod,
  OverviewQuery,
  ByPeriodQuery,
  ByCategoryQuery,
  TrendsQuery,
  TopDaysQuery,
} from './analytics.schema'
import {
  getPeriodWindow,
  getTrendMonths,
  bucketKeyForDate,
  daysBetweenInclusive,
  round2,
} from './analytics.period'
import { listBudgets } from '@/lib/server/budgets/budgets.service'

export interface Overview {
  totalIncome: number
  totalExpense: number
  netBalance: number
  transactionCount: number
  avgDailySpend: number
  from: string
  to: string
}

export interface ByPeriodResult {
  period: AnalyticsPeriod
  labels: string[]
  income: number[]
  expense: number[]
  net: number[]
  from: string
  to: string
}

export interface CategoryBreakdownRow {
  category: { id: string; name: string; emoji: string; color: string } | null
  total: number
  percent: number
  count: number
}

export interface TrendRow {
  month: string
  income: number
  expense: number
  net: number
}

export interface TopDayRow {
  date: string
  total: number
}

export interface BudgetVsActualRow {
  budget: { id: string; name: string; emoji: string; type: string }
  allocated: number
  spent: number
  remaining: number
  percent: number
}

// The shipped frontend always supplies both `from` and `to` (the insights page derives them from
// the active period/date before querying), so there is no live-verified behaviour for the omitted
// case to match. Unbounded-on-the-missing-side is the same convention transactions.service.ts uses
// for its own optional from/to filter; epoch/now give the (non-nullable) response fields concrete
// values instead of leaving a gap. See tickets/F5.md's Decisions table.
function resolveRange(
  from: Date | undefined,
  to: Date | undefined,
  now: Date
): { from: Date; to: Date } {
  return { from: from ?? new Date(0), to: to ?? now }
}

function dayKeyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

export async function getOverview(
  prisma: PrismaClient,
  userId: string,
  query: OverviewQuery,
  now: Date = new Date()
): Promise<Overview> {
  const { from, to } = resolveRange(query.from, query.to, now)
  const where = { userId, date: { gte: from, lte: to } }

  const [grouped, transactionCount] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['isIncome'],
      where,
      _sum: { amount: true },
    }),
    prisma.transaction.count({ where }),
  ])

  const totalIncome = round2(grouped.find((g) => g.isIncome)?._sum.amount ?? 0)
  const totalExpense = round2(
    grouped.find((g) => !g.isIncome)?._sum.amount ?? 0
  )

  return {
    totalIncome,
    totalExpense,
    netBalance: round2(totalIncome - totalExpense),
    transactionCount,
    avgDailySpend: round2(totalExpense / daysBetweenInclusive(from, to)),
    from: from.toISOString(),
    to: to.toISOString(),
  }
}

export async function getByPeriod(
  prisma: PrismaClient,
  userId: string,
  query: ByPeriodQuery,
  now: Date = new Date()
): Promise<ByPeriodResult> {
  const window = getPeriodWindow(query.period, query.date ?? now)

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: window.start, lte: window.end },
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    },
    select: { amount: true, isIncome: true, date: true },
  })

  const indexByKey = new Map(window.buckets.map((b, i) => [b.key, i]))
  const income = new Array<number>(window.buckets.length).fill(0)
  const expense = new Array<number>(window.buckets.length).fill(0)

  for (const tx of transactions) {
    const index = indexByKey.get(bucketKeyForDate(query.period, tx.date))
    if (index === undefined) continue
    if (tx.isIncome) income[index] += tx.amount
    else expense[index] += tx.amount
  }

  return {
    period: query.period,
    labels: window.buckets.map((b) => b.label),
    income: income.map(round2),
    expense: expense.map(round2),
    net: income.map((v, i) => round2(v - expense[i])),
    from: window.start.toISOString(),
    to: window.end.toISOString(),
  }
}

export async function getByCategory(
  prisma: PrismaClient,
  userId: string,
  query: ByCategoryQuery,
  now: Date = new Date()
): Promise<CategoryBreakdownRow[]> {
  const { from, to } = resolveRange(query.from, query.to, now)

  const grouped = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: {
      userId,
      date: { gte: from, lte: to },
      ...(typeof query.isIncome === 'boolean'
        ? { isIncome: query.isIncome }
        : {}),
    },
    _sum: { amount: true },
    _count: true,
  })

  if (grouped.length === 0) return []

  // Scoped by userId too, not just the groupBy above — matches the
  // defense-in-depth convention every other direct Category query in this
  // codebase follows (categories.service.ts, budgets.service.ts's
  // assertCategoryOwned), rather than relying solely on transactions.service.ts's
  // write-time invariant that a categoryId always belongs to its transaction's user.
  const categories = await prisma.category.findMany({
    where: { id: { in: grouped.map((g) => g.categoryId) }, userId },
    select: { id: true, name: true, emoji: true, color: true },
  })
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const total = grouped.reduce((sum, g) => sum + (g._sum.amount ?? 0), 0)

  return grouped.map((g) => {
    const amount = g._sum.amount ?? 0
    return {
      category: categoryById.get(g.categoryId) ?? null,
      total: round2(amount),
      percent: total > 0 ? round2((amount / total) * 100) : 0,
      count: g._count,
    }
  })
}

export async function getTrends(
  prisma: PrismaClient,
  userId: string,
  query: TrendsQuery,
  now: Date = new Date()
): Promise<TrendRow[]> {
  const months = getTrendMonths(query.months, now)
  const first = months[0]
  const last = months[months.length - 1]

  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: first.start, lte: last.end } },
    select: { amount: true, isIncome: true, date: true },
  })

  const byMonth = new Map(months.map((m) => [m.key, { income: 0, expense: 0 }]))
  for (const tx of transactions) {
    const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`
    const bucket = byMonth.get(key)
    if (!bucket) continue
    if (tx.isIncome) bucket.income += tx.amount
    else bucket.expense += tx.amount
  }

  return months.map((m) => {
    const { income, expense } = byMonth.get(m.key)!
    return {
      month: m.key,
      income: round2(income),
      expense: round2(expense),
      net: round2(income - expense),
    }
  })
}

export async function getTopDays(
  prisma: PrismaClient,
  userId: string,
  query: TopDaysQuery,
  now: Date = new Date()
): Promise<TopDayRow[]> {
  const { from, to } = resolveRange(query.from, query.to, now)

  // "Spending" days — matches budgets.service.ts's own definition of spend (isIncome: false only).
  const transactions = await prisma.transaction.findMany({
    where: { userId, isIncome: false, date: { gte: from, lte: to } },
    select: { amount: true, date: true },
  })

  const totalByDay = new Map<string, number>()
  for (const tx of transactions) {
    const key = dayKeyLocal(tx.date)
    totalByDay.set(key, (totalByDay.get(key) ?? 0) + tx.amount)
  }

  return [...totalByDay.entries()]
    .map(([date, total]) => ({ date, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, query.limit)
}

export async function getBudgetVsActual(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date()
): Promise<BudgetVsActualRow[]> {
  const budgets = await listBudgets(prisma, userId, now)

  return budgets.map((b) => ({
    budget: { id: b.id, name: b.name, emoji: b.emoji, type: b.type },
    allocated: b.amount,
    spent: b.spent,
    remaining: b.remaining,
    percent: b.percent,
  }))
}
