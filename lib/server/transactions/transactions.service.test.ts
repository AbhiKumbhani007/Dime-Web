import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from './transactions.service'
import {
  CreateTransactionBodySchema,
  UpdateTransactionBodySchema,
  TransactionParamsSchema,
  ListTransactionsQuerySchema,
} from './transactions.schema'

const VALID_CATEGORY_ID = 'clcat000000000000000000001'
const OTHER_CATEGORY_ID = 'clcat000000000000000000002'
const VALID_TX_ID = 'cltx0000000000000000000001'
const VALID_TEMPLATE_ID = 'cltemplate00000000000000001'

function createMockPrisma() {
  const prisma = {
    category: {
      findFirst: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    template: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  // Runs the callback against the same mock object, so `tx.*` inside
  // createTransaction's $transaction resolves via the same mocks as
  // everywhere else in this file.
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(prisma)
  )
  return prisma as unknown as PrismaClient & {
    category: { findFirst: ReturnType<typeof vi.fn> }
    transaction: {
      findMany: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
    template: { updateMany: ReturnType<typeof vi.fn> }
    $transaction: ReturnType<typeof vi.fn>
  }
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_TX_ID,
    amount: 100,
    date: new Date('2024-06-15T10:00:00.000Z'),
    note: 'Lunch',
    isIncome: false,
    userId: 'user42',
    categoryId: VALID_CATEGORY_ID,
    createdAt: new Date('2024-06-15T10:00:00.000Z'),
    updatedAt: new Date('2024-06-15T10:00:00.000Z'),
    ...overrides,
  }
}

const baseQuery = {
  cursor: undefined,
  limit: 20,
  search: undefined,
  categoryId: undefined,
  isIncome: undefined,
  from: undefined,
  to: undefined,
}

describe('listTransactions', () => {
  it('scopes the query to userId', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    await listTransactions(prisma, 'user42', { ...baseQuery })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.where.userId).toBe('user42')
  })

  it('fetches take = limit + 1', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    await listTransactions(prisma, 'user42', { ...baseQuery, limit: 5 })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.take).toBe(6)
  })

  it('orders by date desc, then createdAt desc', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    await listTransactions(prisma, 'user42', { ...baseQuery })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.orderBy).toEqual([{ date: 'desc' }, { createdAt: 'desc' }])
  })

  it('passes { cursor: { id }, skip: 1 } only when a cursor is given', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    await listTransactions(prisma, 'user42', {
      ...baseQuery,
      cursor: 'clcursor00000000000000000001',
    })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.cursor).toEqual({ id: 'clcursor00000000000000000001' })
    expect(args.skip).toBe(1)
  })

  it('omits cursor/skip entirely when no cursor is given', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    await listTransactions(prisma, 'user42', { ...baseQuery })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.cursor).toBeUndefined()
    expect(args.skip).toBeUndefined()
  })

  it('returns all rows and nextCursor=null when rows.length <= limit', async () => {
    const prisma = createMockPrisma()
    const rows = [makeTx({ id: 'a' }), makeTx({ id: 'b' }), makeTx({ id: 'c' })]
    prisma.transaction.findMany.mockResolvedValue(rows)

    const result = await listTransactions(prisma, 'user42', {
      ...baseQuery,
      limit: 20,
    })

    expect(result.items).toHaveLength(3)
    expect(result.nextCursor).toBeNull()
  })

  it('truncates to limit and sets nextCursor to the last item id when rows.length > limit', async () => {
    const prisma = createMockPrisma()
    const rows = [makeTx({ id: 'a' }), makeTx({ id: 'b' }), makeTx({ id: 'c' })]
    prisma.transaction.findMany.mockResolvedValue(rows)

    const result = await listTransactions(prisma, 'user42', {
      ...baseQuery,
      limit: 2,
    })

    expect(result.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(result.nextCursor).toBe('b')
  })

  it('applies the categoryId filter', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    await listTransactions(prisma, 'user42', {
      ...baseQuery,
      categoryId: VALID_CATEGORY_ID,
    })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.where.categoryId).toBe(VALID_CATEGORY_ID)
  })

  it('applies the isIncome filter', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    await listTransactions(prisma, 'user42', {
      ...baseQuery,
      isIncome: false,
    })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.where.isIncome).toBe(false)
  })

  it('applies the search filter as a case-insensitive note contains', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    await listTransactions(prisma, 'user42', {
      ...baseQuery,
      search: 'coffee',
    })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.where.note).toEqual({ contains: 'coffee', mode: 'insensitive' })
  })

  it('applies the from filter as date.gte', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])
    const from = new Date('2024-01-01T00:00:00.000Z')

    await listTransactions(prisma, 'user42', { ...baseQuery, from })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.where.date).toEqual({ gte: from })
  })

  it('applies the to filter as date.lte', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])
    const to = new Date('2024-12-31T23:59:59.000Z')

    await listTransactions(prisma, 'user42', { ...baseQuery, to })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.where.date).toEqual({ lte: to })
  })

  it('combines categoryId, isIncome, search, from, and to filters', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])
    const from = new Date('2024-01-01T00:00:00.000Z')
    const to = new Date('2024-12-31T23:59:59.000Z')

    await listTransactions(prisma, 'user42', {
      ...baseQuery,
      categoryId: VALID_CATEGORY_ID,
      isIncome: true,
      search: 'coffee',
      from,
      to,
    })

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.where).toEqual({
      userId: 'user42',
      categoryId: VALID_CATEGORY_ID,
      isIncome: true,
      note: { contains: 'coffee', mode: 'insensitive' },
      date: { gte: from, lte: to },
    })
  })
})

describe('getTransaction', () => {
  it('returns the row scoped to id and userId', async () => {
    const prisma = createMockPrisma()
    const tx = makeTx()
    prisma.transaction.findFirst.mockResolvedValue(tx)

    const result = await getTransaction(prisma, 'user42', VALID_TX_ID)

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: VALID_TX_ID, userId: 'user42' },
    })
    expect(result).toEqual(tx)
  })

  it('throws a 404 httpError when not found', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findFirst.mockResolvedValue(null)

    await expect(
      getTransaction(prisma, 'user42', VALID_TX_ID)
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Transaction not found',
    })
  })
})

describe('createTransaction', () => {
  const validData = {
    amount: 12.5,
    date: new Date('2024-06-15T10:00:00.000Z'),
    note: 'Lunch',
    isIncome: false,
    categoryId: VALID_CATEGORY_ID,
  }

  it('checks category ownership via category.findFirst({id, userId}) inside the transaction', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: VALID_CATEGORY_ID,
      userId: 'user42',
    })
    prisma.transaction.create.mockResolvedValue(makeTx())

    await createTransaction(prisma, 'user42', validData)

    expect(prisma.$transaction).toHaveBeenCalled()
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: VALID_CATEGORY_ID, userId: 'user42' },
    })
  })

  it('throws a 404 httpError and never creates when the category is not owned', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue(null)

    await expect(
      createTransaction(prisma, 'user42', validData)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Category not found' })
    expect(prisma.transaction.create).not.toHaveBeenCalled()
  })

  it('creates with a payload that has no templateId key', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: VALID_CATEGORY_ID,
      userId: 'user42',
    })
    prisma.transaction.create.mockResolvedValue(makeTx())

    await createTransaction(prisma, 'user42', {
      ...validData,
      templateId: VALID_TEMPLATE_ID,
    })

    const createArgs = prisma.transaction.create.mock.calls[0]?.[0]
    expect(createArgs.data).not.toHaveProperty('templateId')
    expect(createArgs).toEqual({
      data: {
        amount: validData.amount,
        date: validData.date,
        note: validData.note,
        isIncome: validData.isIncome,
        categoryId: validData.categoryId,
        userId: 'user42',
      },
    })
  })

  it('bumps usageCount and stamps lastUsedAt when templateId is owned', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: VALID_CATEGORY_ID,
      userId: 'user42',
    })
    prisma.transaction.create.mockResolvedValue(makeTx())
    prisma.template.updateMany.mockResolvedValue({ count: 1 })

    await createTransaction(prisma, 'user42', {
      ...validData,
      templateId: VALID_TEMPLATE_ID,
    })

    expect(prisma.template.updateMany).toHaveBeenCalledWith({
      where: { id: VALID_TEMPLATE_ID, userId: 'user42' },
      data: { usageCount: { increment: 1 }, lastUsedAt: expect.any(Date) },
    })
  })

  it('still succeeds and still calls updateMany when templateId belongs to another user (silent no-op)', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: VALID_CATEGORY_ID,
      userId: 'user42',
    })
    const created = makeTx()
    prisma.transaction.create.mockResolvedValue(created)
    prisma.template.updateMany.mockResolvedValue({ count: 0 })

    const result = await createTransaction(prisma, 'user42', {
      ...validData,
      templateId: 'clforeigntemplate000000000001',
    })

    expect(result).toEqual(created)
    expect(prisma.template.updateMany).toHaveBeenCalled()
  })

  it('never calls template.updateMany when templateId is absent', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: VALID_CATEGORY_ID,
      userId: 'user42',
    })
    prisma.transaction.create.mockResolvedValue(makeTx())

    await createTransaction(prisma, 'user42', validData)

    expect(prisma.template.updateMany).not.toHaveBeenCalled()
  })
})

describe('updateTransaction', () => {
  it('throws a 404 httpError and never updates when not owned', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findFirst.mockResolvedValue(null)

    await expect(
      updateTransaction(prisma, 'user42', VALID_TX_ID, { note: 'Updated' })
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Transaction not found',
    })
    expect(prisma.transaction.update).not.toHaveBeenCalled()
  })

  it('never checks category ownership when categoryId is absent from the patch', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findFirst.mockResolvedValue(makeTx())
    prisma.transaction.update.mockResolvedValue(makeTx({ note: 'Updated' }))

    await updateTransaction(prisma, 'user42', VALID_TX_ID, {
      note: 'Updated',
    })

    expect(prisma.category.findFirst).not.toHaveBeenCalled()
  })

  it('never checks category ownership when categoryId equals the existing categoryId', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findFirst.mockResolvedValue(
      makeTx({ categoryId: VALID_CATEGORY_ID })
    )
    prisma.transaction.update.mockResolvedValue(makeTx())

    await updateTransaction(prisma, 'user42', VALID_TX_ID, {
      categoryId: VALID_CATEGORY_ID,
    })

    expect(prisma.category.findFirst).not.toHaveBeenCalled()
  })

  it('re-checks ownership and proceeds when categoryId is present, different, and owned', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findFirst.mockResolvedValue(
      makeTx({ categoryId: VALID_CATEGORY_ID })
    )
    prisma.category.findFirst.mockResolvedValue({
      id: OTHER_CATEGORY_ID,
      userId: 'user42',
    })
    prisma.transaction.update.mockResolvedValue(
      makeTx({ categoryId: OTHER_CATEGORY_ID })
    )

    await updateTransaction(prisma, 'user42', VALID_TX_ID, {
      categoryId: OTHER_CATEGORY_ID,
    })

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: OTHER_CATEGORY_ID, userId: 'user42' },
    })
    expect(prisma.transaction.update).toHaveBeenCalled()
  })

  it('throws a 404 httpError and never updates when the new categoryId is not owned', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findFirst.mockResolvedValue(
      makeTx({ categoryId: VALID_CATEGORY_ID })
    )
    prisma.category.findFirst.mockResolvedValue(null)

    await expect(
      updateTransaction(prisma, 'user42', VALID_TX_ID, {
        categoryId: OTHER_CATEGORY_ID,
      })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Category not found' })
    expect(prisma.transaction.update).not.toHaveBeenCalled()
  })

  it('calls update with exact { where: { id }, data }', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findFirst.mockResolvedValue(makeTx())
    prisma.transaction.update.mockResolvedValue(makeTx({ note: 'Updated' }))

    await updateTransaction(prisma, 'user42', VALID_TX_ID, {
      note: 'Updated',
    })

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: VALID_TX_ID },
      data: { note: 'Updated' },
    })
  })
})

describe('deleteTransaction', () => {
  it('throws a 404 httpError and never deletes when not owned', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findFirst.mockResolvedValue(null)

    await expect(
      deleteTransaction(prisma, 'user42', VALID_TX_ID)
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Transaction not found',
    })
    expect(prisma.transaction.delete).not.toHaveBeenCalled()
  })

  it('deletes with { where: { id } } when owned', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findFirst.mockResolvedValue(makeTx())
    prisma.transaction.delete.mockResolvedValue(makeTx())

    await deleteTransaction(prisma, 'user42', VALID_TX_ID)

    expect(prisma.transaction.delete).toHaveBeenCalledWith({
      where: { id: VALID_TX_ID },
    })
  })
})

describe('transactions schemas', () => {
  const validCreateBody = {
    amount: 12.34,
    date: '2024-06-15T10:00:00.000Z',
    isIncome: false,
    categoryId: VALID_CATEGORY_ID,
  }

  it('rejects amount = 0', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      amount: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a negative amount', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      amount: -10,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an amount with more than 2 decimal places', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      amount: 12.345,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an amount above 1e9', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      amount: 1_000_000_001,
    })
    expect(result.success).toBe(false)
  })

  it('accepts an amount at the max boundary (999_999_999)', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      amount: 999_999_999,
    })
    expect(result.success).toBe(true)
  })

  it('accepts an amount with exactly 2 decimal places (12.34)', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      amount: 12.34,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a body missing isIncome', () => {
    const withoutIsIncome: Record<string, unknown> = { ...validCreateBody }
    delete withoutIsIncome.isIncome
    const result = CreateTransactionBodySchema.safeParse(withoutIsIncome)
    expect(result.success).toBe(false)
  })

  it('rejects a note longer than 500 characters', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      note: 'x'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('trims a whitespace-only note to an empty string', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      note: '   ',
    })
    expect(result.success).toBe(true)
    expect(result.data?.note).toBe('')
  })

  it('rejects an invalid categoryId', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      categoryId: 'not-a-cuid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid templateId', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      templateId: 'not-a-cuid',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a body without templateId (optional)', () => {
    const result = CreateTransactionBodySchema.safeParse(validCreateBody)
    expect(result.success).toBe(true)
  })

  it('rejects an invalid date', () => {
    const result = CreateTransactionBodySchema.safeParse({
      ...validCreateBody,
      date: 'not-a-date',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Date must be a valid ISO 8601 string'
    )
  })

  it('rejects an empty patch body', () => {
    const result = UpdateTransactionBodySchema.safeParse({})
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'At least one field must be provided'
    )
  })

  it('accepts a one-field patch', () => {
    const result = UpdateTransactionBodySchema.safeParse({ note: 'Updated' })
    expect(result.success).toBe(true)
  })

  it('rejects { note: null } — documented gap, not to be fixed here', () => {
    const result = UpdateTransactionBodySchema.safeParse({ note: null })
    expect(result.success).toBe(false)
  })

  it('rejects a non-cuid id in TransactionParamsSchema', () => {
    const result = TransactionParamsSchema.safeParse({ id: 'not-a-cuid' })
    expect(result.success).toBe(false)
  })

  it('defaults limit to 20', () => {
    const result = ListTransactionsQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data?.limit).toBe(20)
  })

  it('rejects limit > 100', () => {
    const result = ListTransactionsQuerySchema.safeParse({ limit: 500 })
    expect(result.success).toBe(false)
  })

  it('rejects limit <= 0', () => {
    const result = ListTransactionsQuerySchema.safeParse({ limit: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects a non-integer limit', () => {
    const result = ListTransactionsQuerySchema.safeParse({ limit: 1.5 })
    expect(result.success).toBe(false)
  })

  it("coerces the string 'true' for isIncome to boolean true", () => {
    const result = ListTransactionsQuerySchema.safeParse({ isIncome: 'true' })
    expect(result.success).toBe(true)
    expect(result.data?.isIncome).toBe(true)
  })

  it("coerces the string 'false' for isIncome to boolean false", () => {
    const result = ListTransactionsQuerySchema.safeParse({ isIncome: 'false' })
    expect(result.success).toBe(true)
    expect(result.data?.isIncome).toBe(false)
  })

  it('accepts from > to without a cross-field error (lenient, matches source)', () => {
    const result = ListTransactionsQuerySchema.safeParse({
      from: '2024-12-31T00:00:00.000Z',
      to: '2024-01-01T00:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })
})
