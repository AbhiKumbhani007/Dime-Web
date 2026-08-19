import { api } from '@/lib/api'
import type { Category } from '@/lib/api/categories'

export type BudgetPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export const BUDGET_PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
]

export interface Budget {
  id: string
  name: string
  emoji: string
  colour: string
  type: BudgetPeriod
  amount: number
  startDate: string
  userId: string
  categoryId: string
  createdAt: string
  updatedAt: string
  category?: Category
}

/** A budget as returned by GET /api/budgets — spend is computed server-side. */
export interface BudgetWithProgress extends Budget {
  spent: number
  remaining: number
  /** Not capped at 100 — a value above 100 means the budget is overspent. */
  percent: number
  daysRemaining: number
  periodStart: string
  periodEnd: string
}

export interface BudgetProgress {
  budget: Budget
  spent: number
  remaining: number
  percent: number
  daysRemaining: number
  periodStart: string
  periodEnd: string
}

export interface BudgetInput {
  name: string
  emoji: string
  colour: string
  type: BudgetPeriod
  amount: number
  categoryId: string
}

export function getBudgets(): Promise<{ budgets: BudgetWithProgress[] }> {
  return api.get('api/budgets').json<{ budgets: BudgetWithProgress[] }>()
}

export function getBudgetProgress(id: string): Promise<BudgetProgress> {
  return api.get(`api/budgets/${id}/progress`).json<BudgetProgress>()
}

export function createBudget(data: BudgetInput): Promise<{ budget: Budget }> {
  return api.post('api/budgets', { json: data }).json<{ budget: Budget }>()
}

export function updateBudget(
  id: string,
  data: Partial<BudgetInput>
): Promise<{ budget: Budget }> {
  return api.patch(`api/budgets/${id}`, { json: data }).json<{ budget: Budget }>()
}

export function deleteBudget(id: string): Promise<void> {
  return api.delete(`api/budgets/${id}`).json<void>()
}
