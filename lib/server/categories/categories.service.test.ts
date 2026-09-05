import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from './categories.service'
import {
  CreateCategoryBodySchema,
  UpdateCategoryBodySchema,
  CategoryParamsSchema,
} from './categories.schema'

function createMockPrisma() {
  return {
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    transaction: {
      count: vi.fn().mockResolvedValue(0),
    },
    budget: {
      count: vi.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaClient & {
    category: {
      findMany: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
    transaction: { count: ReturnType<typeof vi.fn> }
    budget: { count: ReturnType<typeof vi.fn> }
  }
}

const uniqueConstraintError = Object.assign(
  new Error('Unique constraint failed'),
  {
    code: 'P2002',
  }
)

describe('listCategories', () => {
  it('scopes to the user and orders defaults first, then alphabetically', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([{ id: 'cat1' }])

    const result = await listCategories(prisma, 'user42')

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { userId: 'user42' },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })
    expect(result).toEqual([{ id: 'cat1' }])
  })
})

describe('createCategory', () => {
  it('creates with the given fields, defaulting color when omitted', async () => {
    const prisma = createMockPrisma()
    prisma.category.create.mockResolvedValue({ id: 'cat1', name: 'Food' })

    await createCategory(prisma, 'user42', {
      name: 'Food',
      emoji: '🍔',
      color: '#6366f1',
    })

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { name: 'Food', emoji: '🍔', color: '#6366f1', userId: 'user42' },
    })
  })

  it('throws a DUPLICATE_NAME code on a unique-constraint violation', async () => {
    const prisma = createMockPrisma()
    prisma.category.create.mockRejectedValue(uniqueConstraintError)

    await expect(
      createCategory(prisma, 'user42', {
        name: 'Food',
        emoji: '🍔',
        color: '#6366f1',
      })
    ).rejects.toEqual({ code: 'DUPLICATE_NAME' })
  })

  it('rethrows non-P2002 errors unchanged', async () => {
    const prisma = createMockPrisma()
    const dbError = new Error('connection lost')
    prisma.category.create.mockRejectedValue(dbError)

    await expect(
      createCategory(prisma, 'user42', {
        name: 'Food',
        emoji: '🍔',
        color: '#6366f1',
      })
    ).rejects.toBe(dbError)
  })
})

describe('updateCategory', () => {
  it('throws a 404 httpError and never calls update when not owned', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue(null)

    await expect(
      updateCategory(prisma, 'user42', 'cat1', { name: 'Groceries' })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Category not found' })
    expect(prisma.category.update).not.toHaveBeenCalled()
  })

  it('updates with the merged patch data when owned', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: 'cat1',
      userId: 'user42',
    })
    prisma.category.update.mockResolvedValue({ id: 'cat1', name: 'Groceries' })

    await updateCategory(prisma, 'user42', 'cat1', { name: 'Groceries' })

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat1', userId: 'user42' },
    })
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat1' },
      data: { name: 'Groceries' },
    })
  })

  it('throws a DUPLICATE_NAME code on a unique-constraint violation', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: 'cat1',
      userId: 'user42',
    })
    prisma.category.update.mockRejectedValue(uniqueConstraintError)

    await expect(
      updateCategory(prisma, 'user42', 'cat1', { name: 'Groceries' })
    ).rejects.toEqual({ code: 'DUPLICATE_NAME' })
  })
})

describe('deleteCategory', () => {
  it('throws a 404 httpError and never deletes when not owned', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue(null)

    await expect(
      deleteCategory(prisma, 'user42', 'cat1')
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Category not found',
    })
    expect(prisma.category.delete).not.toHaveBeenCalled()
  })

  it('blocks deletion when referenced by a transaction', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: 'cat1',
      userId: 'user42',
    })
    prisma.transaction.count.mockResolvedValue(3)

    await expect(deleteCategory(prisma, 'user42', 'cat1')).rejects.toEqual({
      code: 'CATEGORY_IN_USE',
    })
    expect(prisma.category.delete).not.toHaveBeenCalled()
  })

  it('blocks deletion when referenced by a budget, even with no transactions', async () => {
    // Budget.category has no cascade — this guard is load-bearing, not
    // defensive: without it, the delete would fail with a raw FK error.
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: 'cat1',
      userId: 'user42',
    })
    prisma.transaction.count.mockResolvedValue(0)
    prisma.budget.count.mockResolvedValue(1)

    await expect(deleteCategory(prisma, 'user42', 'cat1')).rejects.toEqual({
      code: 'CATEGORY_IN_USE',
    })
    expect(prisma.category.delete).not.toHaveBeenCalled()
  })

  it('deletes when unreferenced by both transactions and budgets', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: 'cat1',
      userId: 'user42',
    })

    await deleteCategory(prisma, 'user42', 'cat1')

    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: 'cat1' },
    })
  })
})

describe('categories schemas', () => {
  it('rejects an empty patch body', () => {
    const result = UpdateCategoryBodySchema.safeParse({})
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'At least one field must be provided'
    )
  })

  it('accepts a patch with at least one field', () => {
    expect(
      UpdateCategoryBodySchema.safeParse({ name: 'Groceries' }).success
    ).toBe(true)
  })

  it('rejects an invalid hex color', () => {
    const result = CreateCategoryBodySchema.safeParse({
      name: 'Food',
      emoji: '🍔',
      color: 'notacolor',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Color must be a valid hex color (e.g. #6366f1)'
    )
  })

  it('defaults color to #6366f1 when omitted', () => {
    const result = CreateCategoryBodySchema.safeParse({
      name: 'Food',
      emoji: '🍔',
    })
    expect(result.success).toBe(true)
    expect(result.data?.color).toBe('#6366f1')
  })

  it('rejects a non-cuid id in params', () => {
    const result = CategoryParamsSchema.safeParse({ id: 'not-a-cuid' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Invalid category ID')
  })
})
