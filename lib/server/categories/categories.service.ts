import 'server-only'
import type { PrismaClient, Category } from '@prisma/client'
import type {
  CreateCategoryBody,
  UpdateCategoryBody,
} from './categories.schema'
import { httpError } from '@/lib/server/httpError'

export async function listCategories(
  prisma: PrismaClient,
  userId: string
): Promise<Category[]> {
  return prisma.category.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
}

export async function createCategory(
  prisma: PrismaClient,
  userId: string,
  data: CreateCategoryBody
): Promise<Category> {
  try {
    return await prisma.category.create({
      data: {
        name: data.name,
        emoji: data.emoji,
        color: data.color ?? '#6366f1',
        userId,
      },
    })
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2002') {
      throw { code: 'DUPLICATE_NAME' }
    }
    throw err
  }
}

export async function updateCategory(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: UpdateCategoryBody
): Promise<Category> {
  const existing = await prisma.category.findFirst({ where: { id, userId } })
  if (!existing) {
    throw httpError(404, 'Category not found')
  }

  try {
    return await prisma.category.update({
      where: { id },
      data,
    })
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2002') {
      throw { code: 'DUPLICATE_NAME' }
    }
    throw err
  }
}

export async function deleteCategory(
  prisma: PrismaClient,
  userId: string,
  id: string
): Promise<void> {
  const existing = await prisma.category.findFirst({ where: { id, userId } })
  if (!existing) {
    throw httpError(404, 'Category not found')
  }

  const transactionCount = await prisma.transaction.count({
    where: { categoryId: id },
  })
  if (transactionCount > 0) {
    throw { code: 'CATEGORY_IN_USE' }
  }

  // Budget.category has no cascade, so an in-use category would fail with a raw
  // FK error instead of the 409 the client expects.
  const budgetCount = await prisma.budget.count({ where: { categoryId: id } })
  if (budgetCount > 0) {
    throw { code: 'CATEGORY_IN_USE' }
  }

  await prisma.category.delete({ where: { id } })
}
