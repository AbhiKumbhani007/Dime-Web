import { describe, it, expect } from 'vitest'
import {
  parseCsvDate,
  formatCsvDate,
  parseCsvAmount,
  parseCsvType,
  dupKey,
  classifyRow,
  type CsvRow,
} from './csv.parse'

describe('parseCsvDate', () => {
  it('parses a valid yyyy-MM-dd as UTC midnight', () => {
    const date = parseCsvDate('2026-08-30')
    expect(date).not.toBeNull()
    expect(date?.toISOString()).toBe('2026-08-30T00:00:00.000Z')
  })

  it('rejects an empty string', () => {
    expect(parseCsvDate('')).toBeNull()
  })

  it('rejects a non-date string', () => {
    expect(parseCsvDate('not-a-date')).toBeNull()
  })

  it('rejects a slash-separated date (only yyyy-MM-dd is accepted)', () => {
    expect(parseCsvDate('08/30/2026')).toBeNull()
  })

  it('rejects a calendar-invalid date (Feb 30) instead of silently rolling over', () => {
    expect(parseCsvDate('2026-02-30')).toBeNull()
  })

  it('accepts Feb 29 in a leap year', () => {
    expect(parseCsvDate('2028-02-29')).not.toBeNull()
  })

  it('rejects Feb 29 in a non-leap year', () => {
    expect(parseCsvDate('2026-02-29')).toBeNull()
  })

  it('is timezone-independent — always resolves to UTC midnight regardless of host TZ', () => {
    const date = parseCsvDate('2026-01-05')
    expect(date?.getUTCHours()).toBe(0)
    expect(date?.getUTCDate()).toBe(5)
  })
})

describe('formatCsvDate', () => {
  it('round-trips parseCsvDate output back to the same string', () => {
    const iso = '2026-08-30'
    const date = parseCsvDate(iso)
    expect(formatCsvDate(date!)).toBe(iso)
  })
})

describe('parseCsvAmount', () => {
  it('accepts a plain integer', () => {
    expect(parseCsvAmount('100')).toBe(100)
  })

  it('accepts 2 decimal places', () => {
    expect(parseCsvAmount('1250.00')).toBe(1250)
  })

  it('rejects a negative amount', () => {
    expect(parseCsvAmount('-50')).toBeNull()
  })

  it('rejects zero', () => {
    expect(parseCsvAmount('0')).toBeNull()
    expect(parseCsvAmount('0.00')).toBeNull()
  })

  it('rejects more than 2 decimal places', () => {
    expect(parseCsvAmount('12.345')).toBeNull()
  })

  it('rejects a thousands separator', () => {
    expect(parseCsvAmount('1,250.00')).toBeNull()
  })

  it('rejects a currency symbol', () => {
    expect(parseCsvAmount('₹1250.00')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(parseCsvAmount('')).toBeNull()
  })

  it('rejects non-numeric text', () => {
    expect(parseCsvAmount('abc')).toBeNull()
  })
})

describe('parseCsvType', () => {
  it('accepts "Income" and "Expense" exactly', () => {
    expect(parseCsvType('Income')).toBe('Income')
    expect(parseCsvType('Expense')).toBe('Expense')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(parseCsvType('  income  ')).toBe('Income')
    expect(parseCsvType('EXPENSE')).toBe('Expense')
  })

  it('rejects any other value', () => {
    expect(parseCsvType('Loan')).toBeNull()
    expect(parseCsvType('')).toBeNull()
  })
})

describe('dupKey', () => {
  it('is stable across note casing and surrounding whitespace', () => {
    const base = {
      date: parseCsvDate('2026-08-30')!,
      amount: 1250,
      note: 'Weekly shop',
    }
    const a = dupKey(base)
    const b = dupKey({ ...base, note: '  WEEKLY SHOP  ' })
    expect(a).toBe(b)
  })

  it('treats a null note as equal to an empty-string note', () => {
    const date = parseCsvDate('2026-08-30')!
    const a = dupKey({ date, amount: 100, note: null })
    const b = dupKey({ date, amount: 100, note: '' })
    expect(a).toBe(b)
  })

  it('differs when the amount differs, even by a paisa', () => {
    const date = parseCsvDate('2026-08-30')!
    const a = dupKey({ date, amount: 100, note: null })
    const b = dupKey({ date, amount: 100.01, note: null })
    expect(a).not.toBe(b)
  })

  it('differs when the date differs', () => {
    const a = dupKey({
      date: parseCsvDate('2026-08-30')!,
      amount: 100,
      note: null,
    })
    const b = dupKey({
      date: parseCsvDate('2026-08-31')!,
      amount: 100,
      note: null,
    })
    expect(a).not.toBe(b)
  })
})

describe('classifyRow', () => {
  const categoryByName = new Map([['groceries', 'clcategory0000000000000001']])

  function row(overrides: Partial<CsvRow> = {}): CsvRow {
    return {
      Date: '2026-08-30',
      Amount: '1250.00',
      Type: 'Expense',
      Category: 'Groceries',
      Note: '',
      ...overrides,
    }
  }

  it('classifies a fully valid row', () => {
    const result = classifyRow(row({ Note: '  Weekly shop  ' }), categoryByName)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.amount).toBe(1250)
      expect(result.value.isIncome).toBe(false)
      expect(result.value.categoryId).toBe('clcategory0000000000000001')
      expect(result.value.note).toBe('Weekly shop')
    }
  })

  it('an empty note becomes null, not an empty string', () => {
    const result = classifyRow(row({ Note: '   ' }), categoryByName)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.note).toBeNull()
  })

  it('category name matching is case-insensitive', () => {
    const result = classifyRow(row({ Category: 'GROCERIES' }), categoryByName)
    expect(result.ok).toBe(true)
  })

  it.each([
    ['Date', 'MISSING_FIELD', 'date'],
    ['Amount', 'MISSING_FIELD', 'amount'],
    ['Type', 'MISSING_FIELD', 'type'],
    ['Category', 'MISSING_FIELD', 'category'],
  ] as const)('missing %s → %s', (column, code, field) => {
    const result = classifyRow(row({ [column]: '' }), categoryByName)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe(code)
      expect(result.field).toBe(field)
    }
  })

  it('invalid date → INVALID_DATE', () => {
    const result = classifyRow(row({ Date: 'not-a-date' }), categoryByName)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_DATE')
  })

  it('invalid amount format → INVALID_AMOUNT', () => {
    const result = classifyRow(row({ Amount: '₹1,250' }), categoryByName)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_AMOUNT')
  })

  it('amount above the max → AMOUNT_OUT_OF_RANGE', () => {
    const result = classifyRow(row({ Amount: '2000000000' }), categoryByName)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('AMOUNT_OUT_OF_RANGE')
  })

  it('invalid type → INVALID_TYPE', () => {
    const result = classifyRow(row({ Type: 'Loan' }), categoryByName)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('INVALID_TYPE')
  })

  it('unknown category → UNKNOWN_CATEGORY (never auto-created or fuzzy-matched)', () => {
    const result = classifyRow(row({ Category: 'Nonexistent' }), categoryByName)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('UNKNOWN_CATEGORY')
  })

  it('note over 500 chars → NOTE_TOO_LONG', () => {
    const result = classifyRow(row({ Note: 'x'.repeat(501) }), categoryByName)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('NOTE_TOO_LONG')
  })
})
