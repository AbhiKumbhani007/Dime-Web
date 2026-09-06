import 'server-only'

import type { BudgetPeriodType } from './budgets.schema'

export interface PeriodRange {
  start: Date
  end: Date
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Resolve the active period window for a budget type, relative to `reference`.
 *
 * All windows are inclusive on both ends: start is 00:00:00.000 of the first
 * day, end is 23:59:59.999 of the last day, so they can be fed straight into a
 * Prisma `{ gte, lte }` date filter without an off-by-one at midnight.
 *
 *   DAILY   — the reference day
 *   WEEKLY  — Monday through Sunday of the reference week
 *   MONTHLY — 1st through the last day of the reference calendar month
 *   YEARLY  — Jan 1 through Dec 31 of the reference year
 */
export function getPeriodRange(
  type: BudgetPeriodType,
  reference: Date = new Date()
): PeriodRange {
  const y = reference.getFullYear()
  const m = reference.getMonth()
  const d = reference.getDate()

  switch (type) {
    case 'DAILY':
      return { start: startOfDay(y, m, d), end: endOfDay(y, m, d) }

    case 'WEEKLY': {
      // getDay(): 0 = Sunday … 6 = Saturday. Shift so Monday is day 0.
      const offsetFromMonday = (reference.getDay() + 6) % 7
      const monday = startOfDay(y, m, d - offsetFromMonday)
      const sunday = endOfDay(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + 6
      )
      return { start: monday, end: sunday }
    }

    case 'MONTHLY':
      // Day 0 of the next month is the last day of this one.
      return { start: startOfDay(y, m, 1), end: endOfDay(y, m + 1, 0) }

    case 'YEARLY':
      return { start: startOfDay(y, 0, 1), end: endOfDay(y, 11, 31) }
  }
}

/**
 * Whole days left in the period, counting the reference day itself.
 * Always at least 0; a reference date past the end of the period returns 0.
 */
export function daysRemainingInPeriod(
  range: PeriodRange,
  reference: Date = new Date()
): number {
  if (reference > range.end) return 0
  const today = startOfDay(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate()
  )
  const lastDay = startOfDay(
    range.end.getFullYear(),
    range.end.getMonth(),
    range.end.getDate()
  )
  return Math.round((lastDay.getTime() - today.getTime()) / MS_PER_DAY) + 1
}

/** Percent of the budget consumed, rounded to 2dp. Not capped — can exceed 100. */
export function spendPercent(spent: number, amount: number): number {
  if (amount <= 0) return 0
  return Math.round((spent / amount) * 100 * 100) / 100
}

/** Round to 2dp so float sums don't leak 0.30000000000000004 into responses. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Date constructors accept out-of-range day/month values and roll over, which
// is what makes the `d - offsetFromMonday` and `m + 1, 0` tricks above safe.
function startOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 0, 0, 0, 0)
}

function endOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 23, 59, 59, 999)
}
