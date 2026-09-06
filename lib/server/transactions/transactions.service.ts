import 'server-only'
import type { PrismaClient, Transaction } from '@prisma/client'
import type {
  CreateTransactionBody,
  UpdateTransactionBody,
  ListTransactionsQuery,
} from './transactions.schema'
import { httpError } from '@/lib/server/httpError'

export interface ListTransactionsResult {
  items: Transaction[]
  nextCursor: string | null
}

export async function listTransactions(
  prisma: PrismaClient,
  userId: string,
  query: ListTransactionsQuery
): Promise<ListTransactionsResult> {
  const { cursor, limit, search, categoryId, isIncome, from, to } = query

  const where: Record<string, unknown> = { userId }

  if (categoryId) where.categoryId = categoryId
  if (typeof isIncome === 'boolean') where.isIncome = isIncome
  if (search) where.note = { contains: search, mode: 'insensitive' }

  if (from || to) {
    const dateFilter: Record<string, Date> = {}
    if (from) dateFilter.gte = from
    if (to) dateFilter.lte = to
    where.date = dateFilter
  }

  // Fetch limit+1 to know if there's a next page
  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  let nextCursor: string | null = null
  let items = rows
  if (rows.length > limit) {
    items = rows.slice(0, limit)
    nextCursor = items[items.length - 1]?.id ?? null
  }

  return { items, nextCursor }
}

export async function getTransaction(
  prisma: PrismaClient,
  userId: string,
  id: string
): Promise<Transaction> {
  const tx = await prisma.transaction.findFirst({ where: { id, userId } })
  if (!tx) {
    throw httpError(404, 'Transaction not found')
  }
  return tx
}

export async function createTransaction(
  prisma: PrismaClient,
  userId: string,
  data: CreateTransactionBody
): Promise<Transaction> {
  return prisma.$transaction(async (tx) => {
    // Validate category belongs to this user (return 404 if not)
    const category = await tx.category.findFirst({
      where: { id: data.categoryId, userId },
    })
    if (!category) {
      throw httpError(404, 'Category not found')
    }

    const transaction = await tx.transaction.create({
      data: {
        amount: data.amount,
        date: data.date,
        note: data.note,
        isIncome: data.isIncome,
        categoryId: data.categoryId,
        userId,
      },
    })

    // templateId is a write-time signal only — never persisted on Transaction.
    // Scoped to userId so a foreign template silently no-ops rather than
    // erroring: the transaction itself is still valid either way.
    if (data.templateId) {
      await tx.template.updateMany({
        where: { id: data.templateId, userId },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      })
    }

    return transaction
  })
}

export async function updateTransaction(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: UpdateTransactionBody
): Promise<Transaction> {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
  })
  if (!existing) {
    throw httpError(404, 'Transaction not found')
  }

  // If categoryId is being changed, confirm it belongs to this user
  if (data.categoryId && data.categoryId !== existing.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, userId },
    })
    if (!category) {
      throw httpError(404, 'Category not found')
    }
  }

  return prisma.transaction.update({
    where: { id },
    data,
  })
}

export async function deleteTransaction(
  prisma: PrismaClient,
  userId: string,
  id: string
): Promise<void> {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
  })
  if (!existing) {
    throw httpError(404, 'Transaction not found')
  }

  await prisma.transaction.delete({ where: { id } })
}
