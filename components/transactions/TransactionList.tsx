'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useTransactions, useDeleteTransactionWithUndo } from '@/hooks/useTransactions'
import { useCategories } from '@/hooks/useCategories'
import { useTransactionFiltersStore } from '@/store/useTransactionFiltersStore'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatDateShort, groupByDate } from '@/lib/utils/date'
import { TransactionItem } from './TransactionItem'
import { TransactionItemSkeleton } from './TransactionItemSkeleton'
import type { Transaction } from '@/lib/api/transactions'
import type { Category } from '@/lib/api/categories'

interface TransactionListProps {
  onEdit?: (tx: Transaction) => void
}

export function TransactionList({ onEdit }: TransactionListProps) {
  const { search, categoryId, isIncome, from, to } = useTransactionFiltersStore()
  const debouncedSearch = useDebouncedValue(search, 300)

  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      categoryId: categoryId ?? undefined,
      isIncome: isIncome ?? undefined,
      from: from ?? undefined,
      to: to ?? undefined,
    }),
    [debouncedSearch, categoryId, isIncome, from, to]
  )

  const { data, isPending, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useTransactions(filters)

  const removeWithUndo = useDeleteTransactionWithUndo(filters)
  const { data: categoriesData } = useCategories()
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of categoriesData?.categories ?? []) map.set(c.id, c)
    return map
  }, [categoriesData])

  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isPending) {
    return (
      <div data-testid="transaction-list-loading" className="flex flex-col">
        {Array.from({ length: 8 }).map((_, i) => (
          <TransactionItemSkeleton key={i} />
        ))}
      </div>
    )
  }

  const items = data?.pages.flatMap((p) => p.items) ?? []

  if (items.length === 0) {
    return (
      <div
        data-testid="transaction-list-empty"
        className="flex flex-col items-center justify-center py-16 px-6 text-center"
      >
        <p className="text-lg font-semibold text-[var(--foreground)]">No transactions</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Tap the + button to add your first one.
        </p>
      </div>
    )
  }

  const grouped = groupByDate(items, (t) => t.date)
  const sortedKeys = Array.from(grouped.keys()).sort((a, b) => (a < b ? 1 : -1))

  return (
    <div className="flex flex-col">
      {sortedKeys.map((key) => {
        const rows = grouped.get(key) ?? []
        return (
          <section key={key} className="flex flex-col">
            <header className="sticky top-0 z-10 bg-[var(--background)]/95 backdrop-blur px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)]">
              {formatDateShort(key)}
            </header>
            {rows.map((tx) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                category={categoryMap.get(tx.categoryId)}
                onDelete={removeWithUndo}
                onEdit={onEdit}
              />
            ))}
          </section>
        )
      })}

      {/* Infinite-scroll sentinel */}
      <div ref={sentinelRef} className="h-10">
        {isFetchingNextPage && (
          <div className="flex flex-col">
            <TransactionItemSkeleton />
            <TransactionItemSkeleton />
          </div>
        )}
      </div>
    </div>
  )
}
