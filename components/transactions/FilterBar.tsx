'use client'

import { useState } from 'react'
import { CalendarRange, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChipRow } from '@/components/ui/chip-row'
import { useCategories } from '@/hooks/useCategories'
import { useTransactionFiltersStore } from '@/store/useTransactionFiltersStore'
import { formatDateShort } from '@/lib/utils/date'
import { cn } from '@/lib/utils'

/** Shared shape for every control in the row, so they sit on one baseline. */
const CHIP =
  'flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 ' +
  'text-[12.5px] font-medium whitespace-nowrap transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-ring'

const CHIP_ON = 'border-accent bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent'
const CHIP_OFF = 'border-border bg-card text-foreground hover:border-accent'

export function FilterBar() {
  const { data } = useCategories()
  const categories = data?.categories ?? []

  const { categoryId, isIncome, from, to } = useTransactionFiltersStore()
  const setCategoryId = useTransactionFiltersStore((s) => s.setCategoryId)
  const setIsIncome = useTransactionFiltersStore((s) => s.setIsIncome)
  const setDateRange = useTransactionFiltersStore((s) => s.setDateRange)

  const [popoverOpen, setPopoverOpen] = useState(false)

  const hasRange = Boolean(from || to)
  const dateRangeLabel = hasRange
    ? `${from ? formatDateShort(from) : '…'} – ${to ? formatDateShort(to) : '…'}`
    : 'Date range'

  return (
    <ChipRow label="Filter transactions" role="group">
      {/* Expense/Income. Each is a toggle rather than a two-way segmented
          control, because "neither" is a valid third state. */}
      {(
        [
          { label: 'Expense', value: false },
          { label: 'Income', value: true },
        ] as const
      ).map(({ label, value }) => {
        const active = isIncome === value
        return (
          <button
            key={label}
            type="button"
            aria-pressed={active}
            onClick={() => setIsIncome(active ? null : value)}
            className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}
          >
            {label}
          </button>
        )
      })}

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(CHIP, hasRange ? CHIP_ON : CHIP_OFF)}
          >
            <CalendarRange aria-hidden className="h-3.5 w-3.5" />
            {dateRangeLabel}
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
                range?.to ? range.to.toISOString() : null,
              )
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>

      {/* Sibling rather than nested inside the trigger: a button inside a
          button is invalid markup and trips axe's nested-interactive rule. */}
      {hasRange && (
        <Button
          type="button"
          variant="ghost"
          aria-label="Clear date range"
          onClick={() => setDateRange(null, null)}
          className={cn(CHIP, 'w-[34px] justify-center px-0 text-muted-foreground')}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}

      {categories.map((cat) => {
        const active = categoryId === cat.id
        return (
          <button
            key={cat.id}
            type="button"
            aria-pressed={active}
            onClick={() => setCategoryId(active ? null : cat.id)}
            className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}
          >
            <span aria-hidden>{cat.emoji}</span>
            <span className="max-w-[12ch] truncate">{cat.name}</span>
          </button>
        )
      })}
    </ChipRow>
  )
}
