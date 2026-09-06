import 'server-only'

import type { AnalyticsPeriod } from './analytics.schema'

export interface PeriodBucket {
  /** Distinct per bucket within a window — used to route a transaction into it. */
  key: string
  label: string
  start: Date
  end: Date
}

export interface PeriodWindow {
  start: Date
  end: Date
  buckets: PeriodBucket[]
}

export interface TrendMonth {
  /** `YYYY-MM`, matching dime-web's already-shipped `TrendRow.month`. */
  key: string
  start: Date
  end: Date
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

// Date constructors accept out-of-range day/month values and roll over, which
// is what makes `d + i`/`m + 1, 0` below safe — same trick budgets.period.ts uses.
function startOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 0, 0, 0, 0)
}

function endOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 23, 59, 59, 999)
}

function dayKey(y: number, m: number, d: number): string {
  return `d:${y}-${m}-${d}`
}

function monthKey(y: number, m: number): string {
  return `m:${y}-${m}`
}

/**
 * The key a transaction dated `date` routes into for a given `period`'s buckets — the same key
 * format `getPeriodWindow` assigns each bucket, so a lookup by this key always lands correctly.
 */
export function bucketKeyForDate(period: AnalyticsPeriod, date: Date): string {
  return period === 'yearly'
    ? monthKey(date.getFullYear(), date.getMonth())
    : dayKey(date.getFullYear(), date.getMonth(), date.getDate())
}

function dayBucket(year: number, month: number, day: number): PeriodBucket {
  const start = startOfDay(year, month, day)
  return {
    key: dayKey(start.getFullYear(), start.getMonth(), start.getDate()),
    label: WEEKDAY_ABBR[start.getDay()],
    start,
    end: endOfDay(year, month, day),
  }
}

/**
 * Bucket a `period` into the sub-windows `getByPeriod` sums transactions into.
 *
 *   weekly  — 7 daily buckets, Monday through Sunday, labelled "Mon".."Sun"
 *   monthly — one daily bucket per day of the reference calendar month, labelled by day number
 *   yearly  — 12 monthly buckets across the reference calendar year, labelled "Jan".."Dec"
 *
 * Bucketing is done on LOCAL calendar components (getFullYear/getMonth/getDate), not UTC — the
 * same convention `budgets/budgets.period.ts` uses, so a transaction's stored `date` routes into
 * the same bucket a person looking at a calendar would expect.
 */
export function getPeriodWindow(
  period: AnalyticsPeriod,
  reference: Date
): PeriodWindow {
  const y = reference.getFullYear()
  const m = reference.getMonth()
  const d = reference.getDate()

  if (period === 'weekly') {
    // getDay(): 0 = Sunday … 6 = Saturday. Shift so Monday is day 0.
    const offsetFromMonday = (reference.getDay() + 6) % 7
    const mondayDate = d - offsetFromMonday
    const buckets = Array.from({ length: 7 }, (_, i) =>
      dayBucket(y, m, mondayDate + i)
    )
    return { start: buckets[0].start, end: buckets[6].end, buckets }
  }

  if (period === 'monthly') {
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const buckets = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      return { ...dayBucket(y, m, day), label: String(day) }
    })
    return {
      start: buckets[0].start,
      end: buckets[buckets.length - 1].end,
      buckets,
    }
  }

  // yearly
  const buckets = Array.from({ length: 12 }, (_, month) => ({
    key: monthKey(y, month),
    label: MONTH_ABBR[month],
    start: startOfDay(y, month, 1),
    end: endOfDay(y, month + 1, 0),
  }))
  return { start: buckets[0].start, end: buckets[11].end, buckets }
}

/** The `months` calendar months up to and including `reference`'s, oldest first. */
export function getTrendMonths(months: number, reference: Date): TrendMonth[] {
  const y = reference.getFullYear()
  const m = reference.getMonth()

  return Array.from({ length: months }, (_, i) => {
    const offset = months - 1 - i
    const monthDate = new Date(y, m - offset, 1)
    const my = monthDate.getFullYear()
    const mm = monthDate.getMonth()
    return {
      key: `${my}-${String(mm + 1).padStart(2, '0')}`,
      start: startOfDay(my, mm, 1),
      end: endOfDay(my, mm + 1, 0),
    }
  })
}

/** Whole days spanned by [start, end], counting both endpoints. Always at least 1. */
export function daysBetweenInclusive(start: Date, end: Date): number {
  const a = startOfDay(start.getFullYear(), start.getMonth(), start.getDate())
  const b = startOfDay(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / MS_PER_DAY) + 1)
}

/** Round to 2dp so float sums don't leak 0.30000000000000004 into responses. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
