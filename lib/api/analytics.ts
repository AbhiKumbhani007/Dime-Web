import { api } from '@/lib/api'

export type AnalyticsPeriod = 'weekly' | 'monthly' | 'yearly'

export const ANALYTICS_PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

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

/** Drop undefined entries so ky doesn't serialise them as "undefined". */
function searchParams(params: Record<string, string | number | boolean | undefined>) {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out[key] = String(value)
  }
  return out
}

export function getOverview(params: { from?: string; to?: string } = {}): Promise<Overview> {
  return api.get('api/analytics/overview', { searchParams: searchParams(params) }).json<Overview>()
}

export function getByPeriod(params: {
  period: AnalyticsPeriod
  date?: string
  categoryId?: string
}): Promise<ByPeriodResult> {
  return api
    .get('api/analytics/by-period', { searchParams: searchParams(params) })
    .json<ByPeriodResult>()
}

export function getByCategory(params: {
  from?: string
  to?: string
  isIncome?: boolean
}): Promise<{ categories: CategoryBreakdownRow[] }> {
  return api
    .get('api/analytics/by-category', { searchParams: searchParams(params) })
    .json<{ categories: CategoryBreakdownRow[] }>()
}

export function getTrends(params: { months?: number } = {}): Promise<{ trends: TrendRow[] }> {
  return api
    .get('api/analytics/trends', { searchParams: searchParams(params) })
    .json<{ trends: TrendRow[] }>()
}

export function getTopDays(params: {
  from?: string
  to?: string
  limit?: number
}): Promise<{ days: TopDayRow[] }> {
  return api
    .get('api/analytics/top-days', { searchParams: searchParams(params) })
    .json<{ days: TopDayRow[] }>()
}

export function getBudgetVsActual(): Promise<{ budgets: BudgetVsActualRow[] }> {
  return api.get('api/analytics/budget-vs-actual').json<{ budgets: BudgetVsActualRow[] }>()
}
