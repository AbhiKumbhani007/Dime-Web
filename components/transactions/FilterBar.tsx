'use client'

import { useState } from 'react'
import { CalendarRange, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCategories } from '@/hooks/useCategories'
import { useTransactionFiltersStore } from '@/store/useTransactionFiltersStore'
import { formatDateShort } from '@/lib/utils/date'
import { cn } from '@/lib/utils'

export function FilterBar() {
  const { data } = useCategories()
  const categories = data?.categories ?? []

  const { categoryId, isIncome, from, to } = useTransactionFiltersStore()
  const setCategoryId = useTransactionFiltersStore((s) => s.setCategoryId)
  const setIsIncome = useTransactionFiltersStore((s) => s.setIsIncome)
  const setDateRange = useTransactionFiltersStore((s) => s.setDateRange)

  const [popoverOpen, setPopoverOpen] = useState(false)

  const dateRangeLabel =
    from || to
      ? `${from ? formatDateShort(from) : '…'} – ${to ? formatDateShort(to) : '…'}`
      : 'Date range'

  return (
    <div className="w-full overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-2 px-4 py-2 w-max">
        {/* Income/expense segmented toggle */}
        <div
          role="group"
          aria-label="Filter by type"
          className="inline-flex items-center rounded-full border border-[var(--border)] overflow-hidden text-xs"
        >
          <button
            type="button"
            onClick={() => setIsIncome(isIncome === null ? false : null)}
            className={cn(
              'px-3 py-1.5 transition-colors',
              isIncome === false
                ? 'bg-[var(--foreground)] text-[var(--background)]'
                : 'bg-transparent text-[var(--foreground)]'
            )}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setIsIncome(isIncome === null ? true : null)}
            className={cn(
              'px-3 py-1.5 transition-colors',
              isIncome === true
                ? 'bg-[var(--foreground)] text-[var(--background)]'
                : 'bg-transparent text-[var(--foreground)]'
            )}
          >
            Income
          </button>
        </div>

        {/* Date range popover */}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={from || to ? 'default' : 'outline'}
              size="sm"
              className="rounded-full text-xs gap-1.5"
            >
              <CalendarRange className="h-3.5 w-3.5" />
              {dateRangeLabel}
              {(from || to) && (
                <span
                  role="button"
                  aria-label="Clear date range"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDateRange(null, null)
                  }}
                  className="ml-1 inline-flex"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              selected={{
                from: from ? new Date(from) : undefined,
                to: to ? new Date(to) : undefined,
              }}
              onSelect={(range) => {
                setDateRange(
                  range?.from ? range.from.toISOString() : null,
                  range?.to ? range.to.toISOString() : null
                )
              }}
            />
          </PopoverContent>
        </Popover>

        {/* Category chips */}
        {categories.map((cat) => {
          const active = categoryId === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryId(active ? null : cat.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
                active
                  ? 'bg-[var(--foreground)] text-[var(--background)] border-transparent'
                  : 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--muted)]'
              )}
            >
              <span aria-hidden>{cat.emoji}</span>
              <span className="truncate max-w-[8ch]">{cat.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
