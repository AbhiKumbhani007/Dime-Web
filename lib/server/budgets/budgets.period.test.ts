import { describe, it, expect } from 'vitest'

import {
  getPeriodRange,
  daysRemainingInPeriod,
  spendPercent,
  round2,
} from './budgets.period'

describe('Budget period logic', () => {
  describe('getPeriodRange', () => {
    it('DAILY spans midnight to 23:59:59.999 of the reference day', () => {
      const ref = new Date(2026, 3, 15, 14, 30, 0) // Wed 15 Apr 2026
      const { start, end } = getPeriodRange('DAILY', ref)

      expect(start.getFullYear()).toBe(2026)
      expect(start.getMonth()).toBe(3)
      expect(start.getDate()).toBe(15)
      expect(start.getHours()).toBe(0)
      expect(start.getMinutes()).toBe(0)

      expect(end.getDate()).toBe(15)
      expect(end.getHours()).toBe(23)
      expect(end.getMinutes()).toBe(59)
      expect(end.getSeconds()).toBe(59)
      expect(end.getMilliseconds()).toBe(999)
    })

    it('WEEKLY starts on Monday and ends the following Sunday', () => {
      // Wed 15 Apr 2026 → week of Mon 13 Apr … Sun 19 Apr
      const { start, end } = getPeriodRange(
        'WEEKLY',
        new Date(2026, 3, 15, 9, 0, 0)
      )

      expect(start.getDay()).toBe(1) // Monday
      expect(start.getDate()).toBe(13)
      expect(end.getDay()).toBe(0) // Sunday
      expect(end.getDate()).toBe(19)
    })

    it('WEEKLY treats Sunday as the LAST day of the week, not the first', () => {
      // Sun 19 Apr 2026 must still resolve to the Mon 13 → Sun 19 window.
      const { start, end } = getPeriodRange(
        'WEEKLY',
        new Date(2026, 3, 19, 23, 0, 0)
      )

      expect(start.getDate()).toBe(13)
      expect(start.getDay()).toBe(1)
      expect(end.getDate()).toBe(19)
    })

    it('WEEKLY spans a month boundary correctly', () => {
      // Wed 1 Apr 2026 → week starts Mon 30 Mar
      const { start, end } = getPeriodRange(
        'WEEKLY',
        new Date(2026, 3, 1, 12, 0, 0)
      )

      expect(start.getMonth()).toBe(2) // March
      expect(start.getDate()).toBe(30)
      expect(end.getMonth()).toBe(3) // April
      expect(end.getDate()).toBe(5)
    })

    it('MONTHLY spans the 1st to the last day of the reference month', () => {
      const { start, end } = getPeriodRange('MONTHLY', new Date(2026, 3, 15))

      expect(start.getDate()).toBe(1)
      expect(start.getMonth()).toBe(3)
      expect(end.getDate()).toBe(30) // April has 30 days
      expect(end.getMonth()).toBe(3)
    })

    it('MONTHLY handles February in a leap year', () => {
      // 2028 is a leap year → 29 days
      const { end } = getPeriodRange('MONTHLY', new Date(2028, 1, 10))
      expect(end.getDate()).toBe(29)
    })

    it('MONTHLY handles February in a non-leap year', () => {
      const { end } = getPeriodRange('MONTHLY', new Date(2026, 1, 10))
      expect(end.getDate()).toBe(28)
    })

    it('MONTHLY handles December without rolling into the wrong year', () => {
      const { start, end } = getPeriodRange('MONTHLY', new Date(2026, 11, 15))

      expect(start.getMonth()).toBe(11)
      expect(start.getFullYear()).toBe(2026)
      expect(end.getMonth()).toBe(11)
      expect(end.getDate()).toBe(31)
      expect(end.getFullYear()).toBe(2026)
    })

    it('YEARLY spans Jan 1 to Dec 31', () => {
      const { start, end } = getPeriodRange('YEARLY', new Date(2026, 6, 4))

      expect(start.getMonth()).toBe(0)
      expect(start.getDate()).toBe(1)
      expect(end.getMonth()).toBe(11)
      expect(end.getDate()).toBe(31)
      expect(end.getFullYear()).toBe(2026)
    })
  })

  describe('daysRemainingInPeriod', () => {
    it('DAILY on the day itself returns 1', () => {
      const ref = new Date(2026, 3, 15, 10, 0, 0)
      expect(daysRemainingInPeriod(getPeriodRange('DAILY', ref), ref)).toBe(1)
    })

    it('WEEKLY on Monday returns 7', () => {
      const monday = new Date(2026, 3, 13, 10, 0, 0)
      expect(
        daysRemainingInPeriod(getPeriodRange('WEEKLY', monday), monday)
      ).toBe(7)
    })

    it('WEEKLY on Sunday returns 1', () => {
      const sunday = new Date(2026, 3, 19, 10, 0, 0)
      expect(
        daysRemainingInPeriod(getPeriodRange('WEEKLY', sunday), sunday)
      ).toBe(1)
    })

    it('MONTHLY on the 1st of April returns 30', () => {
      const ref = new Date(2026, 3, 1, 8, 0, 0)
      expect(daysRemainingInPeriod(getPeriodRange('MONTHLY', ref), ref)).toBe(
        30
      )
    })

    it('returns 0 when the reference date is past the period end', () => {
      const range = getPeriodRange('DAILY', new Date(2026, 3, 15))
      expect(daysRemainingInPeriod(range, new Date(2026, 3, 20))).toBe(0)
    })
  })

  describe('spendPercent', () => {
    it('computes a normal percentage', () => {
      expect(spendPercent(2500, 10000)).toBe(25)
    })

    it('is not capped at 100 when overspent', () => {
      expect(spendPercent(15000, 10000)).toBe(150)
    })

    it('rounds to 2 decimal places', () => {
      expect(spendPercent(1, 3)).toBe(33.33)
    })

    it('returns 0 for a zero budget rather than Infinity', () => {
      expect(spendPercent(500, 0)).toBe(0)
    })
  })

  describe('round2', () => {
    it('rounds a floating point sum to 2 decimal places', () => {
      expect(round2(0.1 + 0.2)).toBe(0.3)
    })

    it('is a no-op on an already-2dp number', () => {
      expect(round2(33.33)).toBe(33.33)
    })

    it('rounds a longer decimal to the nearest 2dp value', () => {
      expect(round2(1 / 3)).toBe(0.33)
    })
  })
})
