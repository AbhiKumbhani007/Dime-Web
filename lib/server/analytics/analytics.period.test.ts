import { describe, it, expect } from 'vitest'
import {
  getPeriodWindow,
  getTrendMonths,
  daysBetweenInclusive,
  bucketKeyForDate,
  round2,
} from './analytics.period'

describe('getPeriodWindow', () => {
  it('weekly: 7 daily buckets, Monday through Sunday, labelled Mon..Sun', () => {
    const window = getPeriodWindow('weekly', new Date(2026, 3, 15)) // Wed 15 Apr 2026

    expect(window.buckets).toHaveLength(7)
    expect(window.buckets.map((b) => b.label)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ])
    expect(window.start.getDate()).toBe(13)
    expect(window.buckets[0].start.getDate()).toBe(13)
    expect(window.buckets[6].end.getDate()).toBe(19)
    expect(window.end.getDate()).toBe(19)
  })

  it('weekly bucket bounds cover a full day each, midnight to end of day', () => {
    const window = getPeriodWindow('weekly', new Date(2026, 3, 15))
    const monday = window.buckets[0]

    expect(monday.start.getHours()).toBe(0)
    expect(monday.end.getHours()).toBe(23)
    expect(monday.end.getMinutes()).toBe(59)
  })

  it('monthly: one bucket per calendar day, labelled by day number', () => {
    const window = getPeriodWindow('monthly', new Date(2026, 3, 15)) // April 2026, 30 days

    expect(window.buckets).toHaveLength(30)
    expect(window.buckets[0].label).toBe('1')
    expect(window.buckets[29].label).toBe('30')
    expect(window.start.getDate()).toBe(1)
    expect(window.end.getDate()).toBe(30)
  })

  it('monthly: handles a 31-day month and both leap/non-leap Februaries', () => {
    expect(
      getPeriodWindow('monthly', new Date(2026, 0, 10)).buckets
    ).toHaveLength(31) // Jan
    expect(
      getPeriodWindow('monthly', new Date(2024, 1, 10)).buckets
    ).toHaveLength(29) // Feb 2024 (leap)
    expect(
      getPeriodWindow('monthly', new Date(2026, 1, 10)).buckets
    ).toHaveLength(28) // Feb 2026
  })

  it('yearly: 12 monthly buckets, labelled Jan..Dec', () => {
    const window = getPeriodWindow('yearly', new Date(2026, 5, 5))

    expect(window.buckets).toHaveLength(12)
    expect(window.buckets.map((b) => b.label)).toEqual([
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
    ])
    expect(window.start.getMonth()).toBe(0)
    expect(window.start.getDate()).toBe(1)
    expect(window.end.getMonth()).toBe(11)
    expect(window.end.getDate()).toBe(31)
  })

  it('every bucket carries a distinct key, usable to route a transaction into it', () => {
    const weekly = getPeriodWindow('weekly', new Date(2026, 3, 15))
    expect(new Set(weekly.buckets.map((b) => b.key)).size).toBe(7)

    const yearly = getPeriodWindow('yearly', new Date(2026, 5, 5))
    expect(new Set(yearly.buckets.map((b) => b.key)).size).toBe(12)
  })
})

describe('bucketKeyForDate', () => {
  it('matches the bucket a same-day transaction belongs to, for weekly and monthly', () => {
    const txDate = new Date(2026, 3, 14, 9, 30) // Tue, mid-morning
    const weekly = getPeriodWindow('weekly', new Date(2026, 3, 15))
    const monthly = getPeriodWindow('monthly', new Date(2026, 3, 15))

    expect(
      weekly.buckets.find((b) => b.key === bucketKeyForDate('weekly', txDate))
        ?.label
    ).toBe('Tue')
    expect(
      monthly.buckets.find((b) => b.key === bucketKeyForDate('monthly', txDate))
        ?.label
    ).toBe('14')
  })

  it('matches the bucket a same-month transaction belongs to, for yearly', () => {
    const txDate = new Date(2026, 7, 3) // 3 Aug
    const yearly = getPeriodWindow('yearly', new Date(2026, 5, 5))

    expect(
      yearly.buckets.find((b) => b.key === bucketKeyForDate('yearly', txDate))
        ?.label
    ).toBe('Aug')
  })
})

describe('getTrendMonths', () => {
  it('returns `months` entries, oldest first, ending at the reference month', () => {
    const months = getTrendMonths(6, new Date(2026, 3, 15)) // April 2026

    expect(months).toHaveLength(6)
    expect(months.map((m) => m.key)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ])
  })

  it('each month spans its full calendar range', () => {
    const [first] = getTrendMonths(1, new Date(2026, 1, 10)) // Feb 2026

    expect(first.start.getDate()).toBe(1)
    expect(first.start.getMonth()).toBe(1)
    expect(first.end.getDate()).toBe(28)
    expect(first.end.getMonth()).toBe(1)
  })

  it('crosses a year boundary correctly', () => {
    const months = getTrendMonths(3, new Date(2026, 0, 15)) // Jan 2026
    expect(months.map((m) => m.key)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})

describe('daysBetweenInclusive', () => {
  it('counts both endpoints', () => {
    expect(
      daysBetweenInclusive(new Date(2026, 3, 1), new Date(2026, 3, 30))
    ).toBe(30)
  })

  it('is at least 1, even for the same day', () => {
    expect(
      daysBetweenInclusive(new Date(2026, 3, 1), new Date(2026, 3, 1))
    ).toBe(1)
  })
})

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(10 / 3)).toBe(3.33)
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })
})
