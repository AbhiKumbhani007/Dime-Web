import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { exportRows } from './csv.service'

// Adversarial coverage for CSV/formula-injection on export — csv.service.test.ts
// covers comma/quote/newline CSV-escaping but never a leading =, +, -, or @,
// which is the actual "CSV injection" class of vulnerability (CWE-1236):
// Excel/Sheets/LibreOffice treat a cell whose *logical* value (after CSV
// parsing, quotes stripped) starts with one of those characters as a formula,
// not literal text, when the file is opened. A malicious category/note value
// like `=cmd|' /C calc'!A0` or `=HYPERLINK("http://evil","click")` must not
// reach the *logical* exported value unescaped, even if RFC-4180 quoting
// happens to wrap the raw bytes in quotes for an unrelated reason (a comma or
// embedded quote in the payload) — Excel still evaluates the unquoted value.

const USER_ID = 'user1'
const CATEGORY_ID = 'clcategory0000000000000001'

function createMockPrisma() {
  const prisma = {
    transaction: { findMany: vi.fn() },
  }
  return prisma as unknown as PrismaClient & {
    transaction: { findMany: ReturnType<typeof vi.fn> }
  }
}

function makeTransactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cltx0000000000000000000001',
    amount: 100,
    date: new Date('2026-08-30T00:00:00.000Z'),
    note: null,
    isIncome: false,
    userId: USER_ID,
    categoryId: CATEGORY_ID,
    category: { id: CATEGORY_ID, name: 'Groceries' },
    ...overrides,
  }
}

async function exportToString(
  prisma: ReturnType<typeof createMockPrisma>
): Promise<string> {
  let body = ''
  for await (const chunk of exportRows(prisma, USER_ID, {})) body += chunk
  return body
}

// Minimal RFC-4180 single-line field parser — the same unquoting logic a
// spreadsheet app performs before it decides whether a cell's *logical*
// value opens with a formula-trigger character. Deliberately independent of
// this codebase's own toCsvField so a bug in production escaping can't also
// hide inside a shared (and equally buggy) parsing helper.
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let i = 0
  while (i <= line.length) {
    if (line[i] === '"') {
      let j = i + 1
      let value = ''
      while (j < line.length) {
        if (line[j] === '"') {
          if (line[j + 1] === '"') {
            value += '"'
            j += 2
          } else {
            j += 1
            break
          }
        } else {
          value += line[j]
          j += 1
        }
      }
      fields.push(value)
      i = j + 1
    } else {
      const nextComma = line.indexOf(',', i)
      if (nextComma === -1) {
        fields.push(line.slice(i))
        i = line.length + 1
      } else {
        fields.push(line.slice(i, nextComma))
        i = nextComma + 1
      }
    }
  }
  return fields
}

const FORMULA_PAYLOADS = [
  ['=', '=cmd|/C calc!A0'],
  ['+', '+1+1'],
  ['-', '-2+3'],
  ['@', '@SUM(1+1)*cmd|/C calc!A0'],
] as const

describe('CSV export — formula/CSV-injection payloads are neutralized', () => {
  it.each(FORMULA_PAYLOADS)(
    'a Note starting with "%s" does not decode to a formula-triggering logical value',
    async (_label, payload) => {
      const prisma = createMockPrisma()
      prisma.transaction.findMany
        .mockResolvedValueOnce([makeTransactionRow({ note: payload })])
        .mockResolvedValueOnce([])

      const csv = await exportToString(prisma)
      const dataLine = csv.split('\r\n')[1]
      const fields = parseCsvLine(dataLine)
      const noteValue = fields[4]

      // Neutralization (e.g. a leading `'` text-marker) must not merely
      // rely on incidental CSV-quoting — the *logical*, unquoted value a
      // spreadsheet app sees must not start with the trigger character.
      expect(/^[=+\-@]/.test(noteValue)).toBe(false)
      // The original payload content must still be recoverable/present —
      // this must be neutralization, not silent data loss.
      expect(noteValue).toContain(payload.slice(1))
    }
  )

  it.each(FORMULA_PAYLOADS)(
    'a Category name starting with "%s" does not decode to a formula-triggering logical value',
    async (_label, payload) => {
      const prisma = createMockPrisma()
      prisma.transaction.findMany
        .mockResolvedValueOnce([
          makeTransactionRow({ category: { id: CATEGORY_ID, name: payload } }),
        ])
        .mockResolvedValueOnce([])

      const csv = await exportToString(prisma)
      const dataLine = csv.split('\r\n')[1]
      const fields = parseCsvLine(dataLine)
      const categoryValue = fields[3]

      expect(/^[=+\-@]/.test(categoryValue)).toBe(false)
      expect(categoryValue).toContain(payload.slice(1))
    }
  )

  it('a payload with both a leading "=" and an internal comma is still valid, unquotable RFC-4180 CSV', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        makeTransactionRow({ note: '=cmd,arg,"quoted"' }),
      ])
      .mockResolvedValueOnce([])

    const csv = await exportToString(prisma)
    const dataLine = csv.split('\r\n')[1]
    const fields = parseCsvLine(dataLine)

    expect(fields).toHaveLength(5)
    expect(/^[=+\-@]/.test(fields[4])).toBe(false)
  })

  it('a plain, non-triggering value is emitted unchanged (no over-escaping)', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany
      .mockResolvedValueOnce([makeTransactionRow({ note: 'Weekly shop' })])
      .mockResolvedValueOnce([])

    const csv = await exportToString(prisma)
    expect(csv).toContain('2026-08-30,100.00,Expense,Groceries,Weekly shop\r\n')
  })
})
