'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useTransactions, useDeleteTransactionWithUndo } from '@/hooks/useTransactions'
import { useCategories } from '@/hooks/useCategories'
import { useTransactionFiltersStore } from '@/store/useTransactionFiltersStore'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatINR } from '@/lib/utils/currency'
import { formatDateShort, groupByDate } from '@/lib/utils/date'
import { TransactionItem } from './TransactionItem'
import { TransactionItemSkeleton } from './TransactionItemSkeleton'
import type { Transaction } from '@/lib/api/transactions'
import type { Category } from '@/lib/api/categories'

interface TransactionListProps {
  onEdit?: (tx: Transaction) => void
}

/** Signed net for a day's rows — income positive, expense negative. */
function dayTotal(rows: Transaction[]): number {
  return rows.reduce((sum, t) => sum + (t.isIncome ? t.amount : -t.amount), 0)
}

const COLUMN_LABEL =
  'font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground'

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
    [debouncedSearch, categoryId, isIncome, from, to],
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
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isPending) {
    return (
      <div
        data-testid="transaction-list-loading"
        className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
      >
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
        className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-16 text-center"
      >
        <p className="text-lg font-semibold">No transactions</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap the + button to add your first one.
        </p>
      </div>
    )
  }

  const grouped = groupByDate(items, (t) => t.date)
  const sortedKeys = Array.from(grouped.keys()).sort((a, b) => (a < b ? 1 : -1))

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Column header. Mirrors the row's responsive columns exactly, so the
          two stay aligned — the spacer widths are not decorative. */}
      <div className="hidden h-[38px] items-center gap-3.5 border-b border-border bg-muted px-4 md:flex">
        <span className={`w-[74px] shrink-0 ${COLUMN_LABEL}`}>DATE</span>
        <span aria-hidden className="w-[34px] shrink-0" />
        <span className={`min-w-0 flex-1 ${COLUMN_LABEL}`}>NOTE</span>
        <span className={`w-[130px] shrink-0 ${COLUMN_LABEL}`}>CATEGORY</span>
        <span className={`min-w-[112px] shrink-0 text-right ${COLUMN_LABEL}`}>AMOUNT</span>
        <span aria-hidden className="w-[68px] shrink-0" />
      </div>

      {sortedKeys.map((key) => {
        const rows = grouped.get(key) ?? []
        const total = dayTotal(rows)
        return (
          <section key={key}>
            <header className="flex items-baseline justify-between gap-2.5 border-b border-border bg-background px-4 py-2">
              <h2 className="font-mono text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
                {formatDateShort(key)}
              </h2>
              <span
                className={`font-mono text-[11.5px] font-medium ${
                  total >= 0 ? 'text-income' : 'text-expense'
                }`}
              >
                {total >= 0 ? '+' : '−'}
                {formatINR(Math.abs(total))}
              </span>
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
