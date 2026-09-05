import 'server-only'
import type { PrismaClient, Budget, Category } from '@prisma/client'
import type {
  CreateBudgetBody,
  UpdateBudgetBody,
  BudgetPeriodType,
} from './budgets.schema'
import {
  getPeriodRange,
  daysRemainingInPeriod,
  spendPercent,
  round2,
  type PeriodRange,
} from './budgets.period'
import { httpError } from '@/lib/server/httpError'

export interface BudgetProgress {
  spent: number
  remaining: number
  percent: number
  daysRemaining: number
  periodStart: string
  periodEnd: string
}

export type BudgetWithCategory = Budget & { category?: Category }
export type BudgetWithProgress = BudgetWithCategory & BudgetProgress

const budgetInclude = { category: true } as const

async function assertCategoryOwned(
  prisma: PrismaClient,
  userId: string,
  categoryId: string
): Promise<void> {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  })
  if (!category) throw httpError(404, 'Category not found')
}

function buildProgress(
  budget: Budget,
  spent: number,
  range: PeriodRange,
  now: Date
): BudgetProgress {
  const safeSpent = round2(spent)
  return {
    spent: safeSpent,
    remaining: round2(budget.amount - safeSpent),
    percent: spendPercent(safeSpent, budget.amount),
    daysRemaining: daysRemainingInPeriod(range, now),
    periodStart: range.start.toISOString(),
    periodEnd: range.end.toISOString(),
  }
}

/**
 * List every budget with its spend for the currently active period.
 *
 * Budgets of the same type share a period window, so we issue one grouped
 * aggregate per distinct type (at most 4) rather than one query per budget.
 */
export async function listBudgets(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date()
): Promise<BudgetWithProgress[]> {
  const budgets = (await prisma.budget.findMany({
    where: { userId },
    include: budgetInclude,
    orderBy: [{ createdAt: 'desc' }],
  })) as BudgetWithCategory[]

  if (budgets.length === 0) return []

  const types = [...new Set(budgets.map((b) => b.type))] as BudgetPeriodType[]

  const spendByType = new Map<BudgetPeriodType, Map<string, number>>()
  const rangeByType = new Map<BudgetPeriodType, PeriodRange>()

  for (const type of types) {
    const range = getPeriodRange(type, now)
    rangeByType.set(type, range)

    const categoryIds = [
      ...new Set(
        budgets.filter((b) => b.type === type).map((b) => b.categoryId)
      ),
    ]

    const grouped = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        isIncome: false,
        categoryId: { in: categoryIds },
        date: { gte: range.start, lte: range.end },
      },
      _sum: { amount: true },
    })

    spendByType.set(
      type,
      new Map(grouped.map((row) => [row.categoryId, row._sum.amount ?? 0]))
    )
  }

  return budgets.map((budget) => {
    const type = budget.type as BudgetPeriodType
    const range = rangeByType.get(type)!
    const spent = spendByType.get(type)?.get(budget.categoryId) ?? 0
    return { ...budget, ...buildProgress(budget, spent, range, now) }
  })
}

export async function getBudgetProgress(
  prisma: PrismaClient,
  userId: string,
  id: string,
  now: Date = new Date()
): Promise<{ budget: BudgetWithCategory } & BudgetProgress> {
  const budget = (await prisma.budget.findFirst({
    where: { id, userId },
    include: budgetInclude,
  })) as BudgetWithCategory | null

  if (!budget) throw httpError(404, 'Budget not found')

  const range = getPeriodRange(budget.type as BudgetPeriodType, now)

  const aggregate = await prisma.transaction.aggregate({
    where: {
      userId,
      isIncome: false,
      categoryId: budget.categoryId,
      date: { gte: range.start, lte: range.end },
    },
    _sum: { amount: true },
  })

  return {
    budget,
    ...buildProgress(budget, aggregate._sum.amount ?? 0, range, now),
  }
}

export async function createBudget(
  prisma: PrismaClient,
  userId: string,
  data: CreateBudgetBody
): Promise<BudgetWithCategory> {
  await assertCategoryOwned(prisma, userId, data.categoryId)

  return prisma.budget.create({
    data: {
      name: data.name,
      emoji: data.emoji,
      colour: data.colour ?? '#6366f1',
      type: data.type,
      amount: data.amount,
      categoryId: data.categoryId,
      userId,
      ...(data.startDate ? { startDate: data.startDate } : {}),
    },
    include: budgetInclude,
  }) as Promise<BudgetWithCategory>
}

export async function updateBudget(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: UpdateBudgetBody
): Promise<BudgetWithCategory> {
  const existing = await prisma.budget.findFirst({ where: { id, userId } })
  if (!existing) throw httpError(404, 'Budget not found')

  if (data.categoryId) {
    await assertCategoryOwned(prisma, userId, data.categoryId)
  }

  return prisma.budget.update({
    where: { id },
    data,
    include: budgetInclude,
  }) as Promise<BudgetWithCategory>
}

export async function deleteBudget(
  prisma: PrismaClient,
  userId: string,
  id: string
): Promise<void> {
  const existing = await prisma.budget.findFirst({ where: { id, userId } })
  if (!existing) throw httpError(404, 'Budget not found')

  await prisma.budget.delete({ where: { id } })
}
