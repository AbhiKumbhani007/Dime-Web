import 'server-only'

// Default categories seeded for every new user on registration.
// Import and call seedDefaultCategories(prisma, userId) from the auth service.

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Food', emoji: '🍔', color: '#f97316' },
  { name: 'Transport', emoji: '🚌', color: '#3b82f6' },
  { name: 'Rent', emoji: '🏠', color: '#8b5cf6' },
  { name: 'Shopping', emoji: '🛍️', color: '#ec4899' },
  { name: 'Entertainment', emoji: '🎬', color: '#f59e0b' },
  { name: 'Healthcare', emoji: '💊', color: '#10b981' },
  { name: 'Utilities', emoji: '⚡', color: '#6366f1' },
  { name: 'Subscriptions', emoji: '📱', color: '#14b8a6' },
  { name: 'Education', emoji: '📚', color: '#0ea5e9' },
  { name: 'Travel', emoji: '✈️', color: '#f43f5e' },
  { name: 'Personal Care', emoji: '💆', color: '#a855f7' },
  { name: 'Gifts', emoji: '🎁', color: '#d946ef' },
] as const

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary', emoji: '💼', color: '#22c55e' },
  { name: 'Freelance', emoji: '💻', color: '#16a34a' },
  { name: 'Allowance', emoji: '💰', color: '#15803d' },
  { name: 'Investments', emoji: '📈', color: '#166534' },
  { name: 'Rental Income', emoji: '🏡', color: '#14532d' },
  { name: 'Other', emoji: '✨', color: '#6b7280' },
] as const

import { PrismaClient } from '@prisma/client'

export async function seedDefaultCategories(
  prisma: PrismaClient,
  userId: string
) {
  const expenseCategories = DEFAULT_EXPENSE_CATEGORIES.map((cat) => ({
    ...cat,
    userId,
    isDefault: true,
  }))
  const incomeCategories = DEFAULT_INCOME_CATEGORIES.map((cat) => ({
    ...cat,
    userId,
    isDefault: true,
  }))

  await prisma.category.createMany({
    data: [...expenseCategories, ...incomeCategories],
    skipDuplicates: true,
  })
}
