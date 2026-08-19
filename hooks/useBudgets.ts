'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  type BudgetInput,
  type BudgetWithProgress,
} from '@/lib/api/budgets'

export const BUDGETS_KEY = ['budgets'] as const

type BudgetsResponse = { budgets: BudgetWithProgress[] }

export function useBudgets() {
  return useQuery({
    queryKey: BUDGETS_KEY,
    queryFn: getBudgets,
    // Spend is period-scoped and moves whenever a transaction is logged, so
    // this is kept much fresher than the categories cache.
    staleTime: 30 * 1000,
  })
}

export function useCreateBudget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createBudget,

    // Optimistic insert so the new card lands in the grid immediately. Spend
    // figures are unknown client-side, so they start at zero and are corrected
    // by the refetch in onSettled.
    onMutate: async (input: BudgetInput) => {
      await queryClient.cancelQueries({ queryKey: BUDGETS_KEY })
      const previous = queryClient.getQueryData<BudgetsResponse>(BUDGETS_KEY)

      const now = new Date().toISOString()
      const optimistic: BudgetWithProgress = {
        id: `optimistic-${now}`,
        name: input.name,
        emoji: input.emoji,
        colour: input.colour,
        type: input.type,
        amount: input.amount,
        categoryId: input.categoryId,
        startDate: now,
        userId: '',
        createdAt: now,
        updatedAt: now,
        spent: 0,
        remaining: input.amount,
        percent: 0,
        daysRemaining: 0,
        periodStart: now,
        periodEnd: now,
      }

      queryClient.setQueryData<BudgetsResponse>(BUDGETS_KEY, (old) => ({
        budgets: [optimistic, ...(old?.budgets ?? [])],
      }))

      return { previous }
    },

    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BUDGETS_KEY, context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
    },
  })
}

export function useUpdateBudget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BudgetInput> }) =>
      updateBudget(id, data),

    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: BUDGETS_KEY })
      const previous = queryClient.getQueryData<BudgetsResponse>(BUDGETS_KEY)

      queryClient.setQueryData<BudgetsResponse>(BUDGETS_KEY, (old) => ({
        budgets: (old?.budgets ?? []).map((b) => (b.id === id ? { ...b, ...data } : b)),
      }))

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BUDGETS_KEY, context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
    },
  })
}

export function useDeleteBudget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteBudget(id),

    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: BUDGETS_KEY })
      const previous = queryClient.getQueryData<BudgetsResponse>(BUDGETS_KEY)

      queryClient.setQueryData<BudgetsResponse>(BUDGETS_KEY, (old) => ({
        budgets: (old?.budgets ?? []).filter((b) => b.id !== id),
      }))

      return { previous }
    },

    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BUDGETS_KEY, context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
    },
  })
}
