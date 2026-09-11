import { describe, it, expect } from 'vitest'
import { classifyRow, type CsvRow } from './csv.parse'

// Adversarial coverage for classifyRow beyond what csv.parse.test.ts already
// exercises: formula-injection payloads in the Amount column specifically
// (must fail numeric validation, never be evaluated), an embedded NUL byte
// in Note (see the fix in csv.parse.ts — Postgres rejects a literal 0x00
// byte in a `text` column with "invalid byte sequence for encoding UTF8",
// verified live against this repo's own dev database before the fix landed),
// and a pathologically long single field.

describe('classifyRow — adversarial input', () => {
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

  describe('a formula-like value in the Amount column fails numeric validation, never evaluates', () => {
    it.each([
      '=1+1',
      '+1+1',
      '-1+1',
      '@SUM(1,1)',
      '=cmd|"/C calc"!A0',
      '1+1', // no leading trigger char, but still not a valid amount format
    ])('Amount: %s → INVALID_AMOUNT, not evaluated to a number', (amount) => {
      const result = classifyRow(row({ Amount: amount }), categoryByName)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('INVALID_AMOUNT')
        expect(result.field).toBe('amount')
      }
    })
  })

  describe('an embedded NUL byte in Note is rejected, not silently stored', () => {
    it('a NUL byte in the middle of an otherwise-valid note → INVALID_NOTE', () => {
      const withNull = 'Weekly' + String.fromCharCode(0) + 'shop'
      const result = classifyRow(row({ Note: withNull }), categoryByName)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.code).toBe('INVALID_NOTE')
        expect(result.field).toBe('note')
      }
    })

    it('a NUL byte as the entire note content → INVALID_NOTE', () => {
      const result = classifyRow(
        row({ Note: String.fromCharCode(0) }),
        categoryByName
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('INVALID_NOTE')
    })

    it('a note with no NUL byte is unaffected by the new check', () => {
      const result = classifyRow(row({ Note: 'Weekly shop' }), categoryByName)
      expect(result.ok).toBe(true)
    })
  })

  describe('formula-injection payloads in Note are accepted as ordinary text at classification time', () => {
    // Import never evaluates anything server-side — the injection risk is
    // export-time (opened in a spreadsheet app), not import-time. classifyRow
    // must not strip, reject, or otherwise treat these specially; escaping
    // only belongs at the export boundary (see csv.export.injection.test.ts).
    it.each(['=cmd|/C calc', '+1+1', '-1+1', '@SUM(1,1)'])(
      'Note starting with a formula-trigger char (%s) classifies as ready, stored verbatim',
      (note) => {
        const result = classifyRow(row({ Note: note }), categoryByName)
        expect(result.ok).toBe(true)
        if (result.ok) expect(result.value.note).toBe(note)
      }
    )
  })

  it('an extremely long single Note field (10,000 chars) fails cleanly as NOTE_TOO_LONG, without hanging or crashing', () => {
    const huge = 'x'.repeat(10_000)
    const start = Date.now()
    const result = classifyRow(row({ Note: huge }), categoryByName)
    expect(Date.now() - start).toBeLessThan(1000)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('NOTE_TOO_LONG')
  })
})
