'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { periodLabel, isCurrentPeriod, shiftPeriod } from '@/lib/utils/analyticsPeriod'
import type { AnalyticsPeriod } from '@/lib/api/analytics'

interface PeriodNavigatorProps {
  period: AnalyticsPeriod
  date: Date
  onChange: (date: Date) => void
}

export function PeriodNavigator({ period, date, onChange }: PeriodNavigatorProps) {
  const atPresent = isCurrentPeriod(period, date)

  function step(direction: 1 | -1) {
    onChange(shiftPeriod(period, date, direction))
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-label="Previous period"
        onClick={() => step(-1)}
        className="rounded-lg p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <span data-testid="period-label" className="text-sm font-medium">
        {periodLabel(period, date)}
      </span>

      <button
        type="button"
        aria-label="Next period"
        onClick={() => step(1)}
        disabled={atPresent}
        className="rounded-lg p-2 text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
