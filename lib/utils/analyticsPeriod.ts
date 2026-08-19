import {
  addWeeks,
  addMonths,
  addYears,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
  isSameDay,
} from 'date-fns'
import type { AnalyticsPeriod } from '@/lib/api/analytics'

/** Weeks run Monday–Sunday, matching the API's bucketing. */
const WEEK_OPTIONS = { weekStartsOn: 1 } as const

export function shiftPeriod(
  period: AnalyticsPeriod,
  date: Date,
  direction: 1 | -1
): Date {
  switch (period) {
    case 'weekly':
      return addWeeks(date, direction)
    case 'monthly':
      return addMonths(date, direction)
    case 'yearly':
      return addYears(date, direction)
  }
}

export function periodBounds(
  period: AnalyticsPeriod,
  date: Date
): { start: Date; end: Date } {
  switch (period) {
    case 'weekly':
      return { start: startOfWeek(date, WEEK_OPTIONS), end: endOfWeek(date, WEEK_OPTIONS) }
    case 'monthly':
      return { start: startOfMonth(date), end: endOfMonth(date) }
    case 'yearly':
      return { start: startOfYear(date), end: endOfYear(date) }
  }
}

/** Human label for the period selector, e.g. "13 – 19 Apr 2026" or "April 2026". */
export function periodLabel(period: AnalyticsPeriod, date: Date): string {
  const { start, end } = periodBounds(period, date)

  switch (period) {
    case 'weekly': {
      const sameMonth = start.getMonth() === end.getMonth()
      return sameMonth
        ? `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`
        : `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
    }
    case 'monthly':
      return format(date, 'MMMM yyyy')
    case 'yearly':
      return format(date, 'yyyy')
  }
}

/**
 * Whether the period containing `date` also contains today — used to disable
 * the "next" arrow so users can't page into empty future periods.
 */
export function isCurrentPeriod(
  period: AnalyticsPeriod,
  date: Date,
  now: Date = new Date()
): boolean {
  const a = periodBounds(period, date)
  const b = periodBounds(period, now)
  return isSameDay(a.start, b.start)
}

/** API wants plain ISO strings. */
export function toISO(date: Date): string {
  return date.toISOString()
}
