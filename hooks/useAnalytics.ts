'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getOverview,
  getByPeriod,
  getByCategory,
  getTrends,
  getTopDays,
  getBudgetVsActual,
  type AnalyticsPeriod,
} from '@/lib/api/analytics'

export const ANALYTICS_KEY = ['analytics'] as const

// Analytics is derived from transactions, which change often — keep it fresh
// but not so fresh that switching tabs refetches on every render.
const STALE_TIME = 30 * 1000

export function useAnalyticsOverview(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'overview', params],
    queryFn: () => getOverview(params),
    staleTime: STALE_TIME,
  })
}

export function useAnalyticsByPeriod(params: {
  period: AnalyticsPeriod
  date?: string
  categoryId?: string
}) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'by-period', params],
    queryFn: () => getByPeriod(params),
    staleTime: STALE_TIME,
  })
}

export function useAnalyticsByCategory(params: {
  from?: string
  to?: string
  isIncome?: boolean
}) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'by-category', params],
    queryFn: () => getByCategory(params),
    staleTime: STALE_TIME,
  })
}

export function useTrends(params: { months?: number } = {}) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'trends', params],
    queryFn: () => getTrends(params),
    staleTime: STALE_TIME,
  })
}

export function useTopDays(params: { from?: string; to?: string; limit?: number }) {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'top-days', params],
    queryFn: () => getTopDays(params),
    staleTime: STALE_TIME,
  })
}

export function useBudgetVsActual() {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'budget-vs-actual'],
    queryFn: getBudgetVsActual,
    staleTime: STALE_TIME,
  })
}
