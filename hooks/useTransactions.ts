'use client'

import { useRef } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type Transaction,
  type TransactionListResponse,
  type TransactionListParams,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '@/lib/api/transactions'
import { toastAction, toastError } from '@/lib/toast'

export const TRANSACTIONS_KEY = ['transactions'] as const

const PAGE_SIZE = 20

type TransactionFiltersKey = Omit<TransactionListParams, 'cursor' | 'limit'>

export function transactionsQueryKey(filters: TransactionFiltersKey = {}) {
  return [...TRANSACTIONS_KEY, filters] as const
}

type InfiniteTransactions = InfiniteData<TransactionListResponse>

/** Paginated list of transactions with filters. */
export function useTransactions(filters: TransactionFiltersKey = {}) {
  return useInfiniteQuery<TransactionListResponse>({
    queryKey: transactionsQueryKey(filters),
    queryFn: ({ pageParam }) =>
      listTransactions({
        ...filters,
        limit: PAGE_SIZE,
        cursor: (pageParam as string | undefined) ?? undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

/** Create a transaction with an optimistic prepend to the first page. */
export function useCreateTransaction(filters: TransactionFiltersKey = {}) {
  const queryClient = useQueryClient()
  const key = transactionsQueryKey(filters)

  return useMutation({
    mutationFn: (input: CreateTransactionInput) => createTransaction(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<InfiniteTransactions>(key)

      const optimistic: Transaction = {
        id: `optimistic-${Date.now()}`,
        amount: input.amount,
        date: input.date,
        note: input.note ?? null,
        isIncome: input.isIncome,
        categoryId: input.categoryId,
        userId: 'optimistic',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      queryClient.setQueryData<InfiniteTransactions>(key, (old) => {
        if (!old || old.pages.length === 0) {
          return {
            pageParams: [undefined],
            pages: [{ items: [optimistic], nextCursor: null }],
          }
        }
        const [first, ...rest] = old.pages
        return {
          ...old,
          pages: [{ ...first, items: [optimistic, ...first.items] }, ...rest],
        }
      })

      return { previous, optimisticId: optimistic.id }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(key, ctx.previous)
      }
      toastError('Could not add transaction')
    },
    onSuccess: (res, _input, ctx) => {
      // Swap optimistic row with real one
      const real = res.transaction
      queryClient.setQueryData<InfiniteTransactions>(key, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((t) => (t.id === ctx?.optimisticId ? real : t)),
          })),
        }
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
    },
  })
}

/** Update with optimistic patch. */
export function useUpdateTransaction(filters: TransactionFiltersKey = {}) {
  const queryClient = useQueryClient()
  const key = transactionsQueryKey(filters)

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTransactionInput }) =>
      updateTransaction(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<InfiniteTransactions>(key)

      queryClient.setQueryData<InfiniteTransactions>(key, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((t) =>
              t.id === id
                ? {
                    ...t,
                    ...patch,
                    note: patch.note !== undefined ? patch.note ?? null : t.note,
                  }
                : t
            ),
          })),
        }
      })

      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(key, ctx.previous)
      }
      toastError('Could not update transaction')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
    },
  })
}

/** Plain delete mutation (no undo). */
export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
    },
  })
}

/**
 * Returns a function `(transaction) => void` that:
 *   1. Removes the transaction from the cache immediately.
 *   2. Shows an action toast with an "Undo" button.
 *   3. Only fires the real DELETE after 5s if the user didn't tap undo.
 *   4. On undo, restores the transaction to cache and cancels the delete.
 */
export function useDeleteTransactionWithUndo(filters: TransactionFiltersKey = {}) {
  const queryClient = useQueryClient()
  const key = transactionsQueryKey(filters)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  return function removeWithUndo(transaction: Transaction): void {
    const id = transaction.id

    // Snapshot for restore
    const previous = queryClient.getQueryData<InfiniteTransactions>(key)

    // Remove from cache immediately (optimistic delete)
    queryClient.setQueryData<InfiniteTransactions>(key, (old) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.filter((t) => t.id !== id),
        })),
      }
    })

    // Schedule the real delete
    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      deleteTransaction(id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
        })
        .catch(() => {
          // Rollback if backend rejects
          if (previous) queryClient.setQueryData(key, previous)
          toastError('Could not delete transaction')
        })
    }, 5000)
    timersRef.current.set(id, timer)

    toastAction('Deleted', {
      label: 'Undo',
      duration: 5000,
      onClick: () => {
        const pending = timersRef.current.get(id)
        if (pending) {
          clearTimeout(pending)
          timersRef.current.delete(id)
        }
        if (previous) {
          queryClient.setQueryData(key, previous)
        }
      },
    })
  }
}
