'use client'

import { format, parseISO } from 'date-fns'

import { formatINR } from '@/lib/utils/currency'
import type { TopDayRow } from '@/lib/api/analytics'

export function TopDaysList({ days }: { days: TopDayRow[] }) {
  if (days.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No spending recorded in this range.
      </p>
    )
  }

  const max = days[0]?.total ?? 0

  return (
    <ol data-testid="top-days-list" className="space-y-2">
      {days.map((day, i) => (
        <li key={day.date} className="flex items-center gap-3 text-sm">
          <span className="w-4 shrink-0 text-xs text-[var(--muted-foreground)]">
            {i + 1}
          </span>
          <span className="w-24 shrink-0">{format(parseISO(day.date), 'd MMM yyyy')}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
            <span
              className="block h-full rounded-full bg-[var(--accent)]"
              style={{ width: max > 0 ? `${(day.total / max) * 100}%` : '0%' }}
            />
          </span>
          <span className="shrink-0 font-medium">{formatINR(day.total)}</span>
        </li>
      ))}
    </ol>
  )
}
