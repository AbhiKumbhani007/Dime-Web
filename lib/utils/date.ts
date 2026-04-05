/**
 * Common date helpers used across the app.
 * We keep this dependency-free (no date-fns) to keep bundle size small.
 */

/** Format a date as "Mon, 5 Apr" */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Format a date as "5 Apr 2026" */
export function formatDateLong(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Format a date as "HH:MM" (24h) */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Format for an ISO date string input (YYYY-MM-DD) */
export function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

/** Get the Monday of the week containing the given date */
export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Get the Sunday of the week containing the given date */
export function endOfWeek(date: Date): Date {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

/** Get the first day of a month */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

/** Get the last day of a month */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

/** Format as "Apr 2026" */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

/** Check if two dates are the same calendar day */
export function isSameDay(a: Date | string, b: Date | string): boolean {
  const da = typeof a === 'string' ? new Date(a) : a
  const db = typeof b === 'string' ? new Date(b) : b
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** Group an array of items by their calendar date key (YYYY-MM-DD) */
export function groupByDate<T>(items: T[], getDate: (item: T) => string | Date): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = toISODateString(
      typeof getDate(item) === 'string'
        ? new Date(getDate(item) as string)
        : (getDate(item) as Date)
    )
    const existing = map.get(key) ?? []
    existing.push(item)
    map.set(key, existing)
  }
  return map
}
