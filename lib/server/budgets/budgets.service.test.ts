import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  listBudgets,
  getBudgetProgress,
  createBudget,
  updateBudget,
  deleteBudget,
} from './budgets.service'
import {
  CreateBudgetBodySchema,
  UpdateBudgetBodySchema,
  BudgetParamsSchema,
  type CreateBudgetBody,
} from './budgets.schema'

function createMockPrisma() {
  return {
    budget: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
    transaction: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
  } as unknown as PrismaClient & {
    budget: {
      findMany: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
    category: { findFirst: ReturnType<typeof vi.fn> }
    transaction: {
      groupBy: ReturnType<typeof vi.fn>
      aggregate: ReturnType<typeof vi.fn>
    }
  }
}

const CAT_ID = 'clcategory0000000000000000000'
const BUDGET_ID = 'clbudget000000000000000000000'

function makeBudget(overrides: Record<string, unknown> = {}) {
  return {
    id: BUDGET_ID,
    name: 'Groceries',
    emoji: '🛒',
    colour: '#6366f1',
    type: 'MONTHLY',
    amount: 10000,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'user1',
    categoryId: CAT_ID,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('listBudgets', () => {
  it('returns [] without querying transactions when there are no budgets', async () => {
    const prisma = createMockPrisma()
    prisma.budget.findMany.mockResolvedValue([])

    const result = await listBudgets(prisma, 'user1')

    expect(result).toEqual([])
    expect(prisma.transaction.groupBy).not.toHaveBeenCalled()
  })

  it('only counts expenses inside the active period', async () => {
    const prisma = createMockPrisma()
    const now = new Date(2026, 3, 15, 12, 0, 0)

    prisma.budget.findMany.mockResolvedValue([makeBudget({ amount: 10000 })])
    prisma.transaction.groupBy.mockResolvedValue([
      { categoryId: CAT_ID, _sum: { amount: 2500 } },
    ])

    const [budget] = await listBudgets(prisma, 'user1', now)

    expect(budget.spent).toBe(2500)
    expect(budget.remaining).toBe(7500)
    expect(budget.percent).toBe(25)

    // The query must be scoped to the user, to expenses only, and to the window.
    const where = prisma.transaction.groupBy.mock.calls[0][0].where
    expect(where.userId).toBe('user1')
    expect(where.isIncome).toBe(false)
    expect(where.date.gte.getDate()).toBe(1)
    expect(where.date.lte.getDate()).toBe(30)
  })

  it('reports 0 spend for a budget with no matching transactions', async () => {
    const prisma = createMockPrisma()

    prisma.budget.findMany.mockResolvedValue([makeBudget()])
    prisma.transaction.groupBy.mockResolvedValue([]) // nothing in this period

    const [budget] = await listBudgets(prisma, 'user1', new Date(2026, 3, 15))

    expect(budget.spent).toBe(0)
    expect(budget.percent).toBe(0)
    expect(budget.remaining).toBe(10000)
  })

  it('issues one grouped query per distinct period type, not per budget', async () => {
    const prisma = createMockPrisma()

    prisma.budget.findMany.mockResolvedValue([
      makeBudget({ id: 'clb1', type: 'DAILY' }),
      makeBudget({ id: 'clb2', type: 'DAILY' }),
      makeBudget({ id: 'clb3', type: 'MONTHLY' }),
    ])
    prisma.transaction.groupBy.mockResolvedValue([])

    await listBudgets(prisma, 'user1', new Date(2026, 3, 15))

    // 3 budgets, 2 distinct types → 2 queries, not 3
    expect(prisma.transaction.groupBy).toHaveBeenCalledTimes(2)
  })

  it('allows percent to exceed 100 and remaining to go negative when overspent', async () => {
    const prisma = createMockPrisma()

    prisma.budget.findMany.mockResolvedValue([makeBudget({ amount: 1000 })])
    prisma.transaction.groupBy.mockResolvedValue([
      { categoryId: CAT_ID, _sum: { amount: 1500 } },
    ])

    const [budget] = await listBudgets(prisma, 'user1', new Date(2026, 3, 15))

    expect(budget.percent).toBe(150)
    expect(budget.remaining).toBe(-500)
  })
})

describe('getBudgetProgress', () => {
  it('returns the full progress payload including the nested budget', async () => {
    const prisma = createMockPrisma()
    const now = new Date(2026, 3, 15, 12, 0, 0)

    prisma.budget.findFirst.mockResolvedValue(makeBudget({ amount: 10000 }))
    prisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 4000 } })

    const result = await getBudgetProgress(prisma, 'user1', BUDGET_ID, now)

    expect(result.spent).toBe(4000)
    expect(result.remaining).toBe(6000)
    expect(result.percent).toBe(40)
    expect(result.daysRemaining).toBe(16) // 15th → 30th inclusive
    expect(result.budget.id).toBe(BUDGET_ID)
  })

  it('throws a 404 for a budget owned by another user (or missing)', async () => {
    const prisma = createMockPrisma()
    prisma.budget.findFirst.mockResolvedValue(null)

    await expect(
      getBudgetProgress(prisma, 'user1', BUDGET_ID)
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('createBudget', () => {
  it('creates with the given fields, passing colour through when provided', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: CAT_ID,
      userId: 'user42',
    })
    prisma.budget.create.mockResolvedValue(makeBudget())

    const startDate = new Date('2026-02-01T00:00:00.000Z')
    await createBudget(prisma, 'user42', {
      name: 'Groceries',
      emoji: '🛒',
      colour: '#ff0000',
      type: 'MONTHLY',
      amount: 10000,
      categoryId: CAT_ID,
      startDate,
    })

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: CAT_ID, userId: 'user42' },
    })
    expect(prisma.budget.create).toHaveBeenCalledWith({
      data: {
        name: 'Groceries',
        emoji: '🛒',
        colour: '#ff0000',
        type: 'MONTHLY',
        amount: 10000,
        categoryId: CAT_ID,
        userId: 'user42',
        startDate,
      },
      include: { category: true },
    })
  })

  it('falls back to the default colour when the caller omits it (defensive — the schema normally fills this in before the service is called)', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: CAT_ID,
      userId: 'user42',
    })
    prisma.budget.create.mockResolvedValue(makeBudget())

    await createBudget(prisma, 'user42', {
      name: 'Groceries',
      emoji: '🛒',
      type: 'MONTHLY',
      amount: 10000,
      categoryId: CAT_ID,
    } as CreateBudgetBody)

    expect(prisma.budget.create).toHaveBeenCalledWith({
      data: {
        name: 'Groceries',
        emoji: '🛒',
        colour: '#6366f1',
        type: 'MONTHLY',
        amount: 10000,
        categoryId: CAT_ID,
        userId: 'user42',
      },
      include: { category: true },
    })
  })

  it('throws a 404 httpError and never calls create when the category is not owned', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue(null)

    await expect(
      createBudget(prisma, 'user42', {
        name: 'Groceries',
        emoji: '🛒',
        type: 'MONTHLY',
        amount: 10000,
        categoryId: CAT_ID,
      } as CreateBudgetBody)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Category not found' })
    expect(prisma.budget.create).not.toHaveBeenCalled()
  })
})

describe('updateBudget', () => {
  it('throws a 404 httpError and never calls update when not owned', async () => {
    const prisma = createMockPrisma()
    prisma.budget.findFirst.mockResolvedValue(null)

    await expect(
      updateBudget(prisma, 'user42', BUDGET_ID, { name: 'Rent' })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Budget not found' })
    expect(prisma.budget.update).not.toHaveBeenCalled()
  })

  it('updates with the patch data when owned and the patch has no categoryId', async () => {
    const prisma = createMockPrisma()
    prisma.budget.findFirst.mockResolvedValue(makeBudget())
    prisma.budget.update.mockResolvedValue(makeBudget({ name: 'Rent' }))

    await updateBudget(prisma, 'user42', BUDGET_ID, { name: 'Rent' })

    expect(prisma.category.findFirst).not.toHaveBeenCalled()
    expect(prisma.budget.update).toHaveBeenCalledWith({
      where: { id: BUDGET_ID },
      data: { name: 'Rent' },
      include: { category: true },
    })
  })

  it('re-checks category ownership before updating when the patch includes a categoryId', async () => {
    const prisma = createMockPrisma()
    prisma.budget.findFirst.mockResolvedValue(makeBudget())
    prisma.category.findFirst.mockResolvedValue({
      id: CAT_ID,
      userId: 'user42',
    })
    prisma.budget.update.mockResolvedValue(makeBudget({ categoryId: CAT_ID }))

    await updateBudget(prisma, 'user42', BUDGET_ID, { categoryId: CAT_ID })

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: CAT_ID, userId: 'user42' },
    })
    expect(prisma.budget.update).toHaveBeenCalledWith({
      where: { id: BUDGET_ID },
      data: { categoryId: CAT_ID },
      include: { category: true },
    })
  })

  it('throws a 404 httpError and never calls update when the patched category is not owned', async () => {
    const prisma = createMockPrisma()
    prisma.budget.findFirst.mockResolvedValue(makeBudget())
    prisma.category.findFirst.mockResolvedValue(null)

    await expect(
      updateBudget(prisma, 'user42', BUDGET_ID, { categoryId: CAT_ID })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Category not found' })
    expect(prisma.budget.update).not.toHaveBeenCalled()
  })
})

describe('deleteBudget', () => {
  it('throws a 404 httpError and never deletes when not owned', async () => {
    const prisma = createMockPrisma()
    prisma.budget.findFirst.mockResolvedValue(null)

    await expect(
      deleteBudget(prisma, 'user42', BUDGET_ID)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Budget not found' })
    expect(prisma.budget.delete).not.toHaveBeenCalled()
  })

  it('deletes when owned', async () => {
    const prisma = createMockPrisma()
    prisma.budget.findFirst.mockResolvedValue(makeBudget())

    await deleteBudget(prisma, 'user42', BUDGET_ID)

    expect(prisma.budget.delete).toHaveBeenCalledWith({
      where: { id: BUDGET_ID },
    })
  })
})

describe('budgets schemas', () => {
  it('rejects an empty name', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: '',
      emoji: '🛒',
      type: 'MONTHLY',
      amount: 100,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Name is required')
  })

  it('rejects a name over 50 characters', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'a'.repeat(51),
      emoji: '🛒',
      type: 'MONTHLY',
      amount: 100,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Name must be at most 50 characters'
    )
  })

  it('rejects an empty emoji', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'Groceries',
      emoji: '',
      type: 'MONTHLY',
      amount: 100,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Emoji is required')
  })

  it('rejects an emoji over 10 characters', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'Groceries',
      emoji: '🛒'.repeat(11),
      type: 'MONTHLY',
      amount: 100,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Emoji must be at most 10 characters'
    )
  })

  it('rejects an invalid hex colour', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'Groceries',
      emoji: '🛒',
      colour: 'notacolor',
      type: 'MONTHLY',
      amount: 100,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Colour must be a valid hex colour (e.g. #6366f1)'
    )
  })

  it('defaults colour to #6366f1 when omitted', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'Groceries',
      emoji: '🛒',
      type: 'MONTHLY',
      amount: 100,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(true)
    expect(result.data?.colour).toBe('#6366f1')
  })

  it('rejects a type outside DAILY/WEEKLY/MONTHLY/YEARLY with a custom message', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'Groceries',
      emoji: '🛒',
      type: 'FORTNIGHTLY',
      amount: 100,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Type must be one of DAILY, WEEKLY, MONTHLY, YEARLY'
    )
  })

  it('accepts each of DAILY, WEEKLY, MONTHLY, YEARLY', () => {
    for (const type of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']) {
      const result = CreateBudgetBodySchema.safeParse({
        name: 'Groceries',
        emoji: '🛒',
        type,
        amount: 100,
        categoryId: CAT_ID,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects a non-positive amount (delegates to the shared AmountSchema)', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'Groceries',
      emoji: '🛒',
      type: 'MONTHLY',
      amount: 0,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Amount must be greater than 0'
    )
  })

  it('rejects an amount with more than 2 decimal places', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'Groceries',
      emoji: '🛒',
      type: 'MONTHLY',
      amount: 10.999,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Amount must have at most 2 decimal places'
    )
  })

  it('rejects an amount over 1,000,000,000', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'Groceries',
      emoji: '🛒',
      type: 'MONTHLY',
      amount: 1_000_000_001,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Amount must be at most 1,000,000,000'
    )
  })

  it('rejects a non-finite amount', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'Groceries',
      emoji: '🛒',
      type: 'MONTHLY',
      amount: Infinity,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(false)
  })

  it('accepts a valid create body', () => {
    const result = CreateBudgetBodySchema.safeParse({
      name: 'Groceries',
      emoji: '🛒',
      type: 'MONTHLY',
      amount: 250.5,
      categoryId: CAT_ID,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty patch body', () => {
    const result = UpdateBudgetBodySchema.safeParse({})
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'At least one field must be provided'
    )
  })

  it('accepts a patch with at least one field', () => {
    expect(UpdateBudgetBodySchema.safeParse({ name: 'Rent' }).success).toBe(
      true
    )
  })

  it('rejects a non-cuid id in params', () => {
    const result = BudgetParamsSchema.safeParse({ id: 'not-a-cuid' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Invalid budget ID')
  })
})
