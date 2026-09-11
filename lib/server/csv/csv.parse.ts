import 'server-only'

export type ImportErrorCode =
  | 'INVALID_DATE'
  | 'INVALID_AMOUNT'
  | 'INVALID_TYPE'
  | 'UNKNOWN_CATEGORY'
  | 'MISSING_FIELD'
  | 'NOTE_TOO_LONG'
  | 'AMOUNT_OUT_OF_RANGE'

export interface ImportErrorRow {
  row: number
  raw: string
  reason: string
  code: ImportErrorCode
  field: 'date' | 'amount' | 'type' | 'category' | 'note' | null
}

export interface CsvRow {
  Date?: string
  Amount?: string
  Type?: string
  Category?: string
  Note?: string
}

export interface ParsedRow {
  date: Date
  amount: number
  isIncome: boolean
  categoryId: string
  note: string | null
}

export type ClassifyResult =
  | { ok: true; value: ParsedRow }
  | {
      ok: false
      code: ImportErrorCode
      field: ImportErrorRow['field']
      reason: string
    }

const MAX_NOTE_LENGTH = 500
const MAX_AMOUNT = 1_000_000_000

// The one UTC-midnight date parser — reused by row parsing, dupKey(), and
// export's own date formatting. Never falls through to a local-time Date
// constructor, which is what causes the classic Asia/Kolkata off-by-one-day bug.
export function parseCsvDate(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  // Reject e.g. 2026-02-30, which Date.UTC would otherwise silently roll into March.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

export function formatCsvDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// No currency symbol, no thousands separator — matches export's own format so
// round-tripping your own export always parses cleanly.
export function parseCsvAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

export function parseCsvType(raw: string): 'Income' | 'Expense' | null {
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'income') return 'Income'
  if (normalized === 'expense') return 'Expense'
  return null
}

// Day-granularity UTC, integer-paise comparison, null note ≡ empty string.
// Callers add each accepted key to their own `seen` set so in-file duplicates
// (two identical rows in the same CSV) are caught, not just DB-vs-file ones.
export function dupKey(t: {
  date: Date
  amount: number
  note: string | null
}): string {
  return [
    formatCsvDate(t.date),
    Math.round(t.amount * 100),
    (t.note ?? '').trim().toLowerCase(),
  ].join('|')
}

export function classifyRow(
  row: CsvRow,
  categoryByName: Map<string, string>
): ClassifyResult {
  const dateRaw = row.Date?.trim()
  const amountRaw = row.Amount?.trim()
  const typeRaw = row.Type?.trim()
  const categoryRaw = row.Category?.trim()
  const noteRaw = row.Note ?? ''

  if (!dateRaw)
    return {
      ok: false,
      code: 'MISSING_FIELD',
      field: 'date',
      reason: 'Date is required',
    }
  if (!amountRaw) {
    return {
      ok: false,
      code: 'MISSING_FIELD',
      field: 'amount',
      reason: 'Amount is required',
    }
  }
  if (!typeRaw)
    return {
      ok: false,
      code: 'MISSING_FIELD',
      field: 'type',
      reason: 'Type is required',
    }
  if (!categoryRaw) {
    return {
      ok: false,
      code: 'MISSING_FIELD',
      field: 'category',
      reason: 'Category is required',
    }
  }

  const date = parseCsvDate(dateRaw)
  if (!date) {
    return {
      ok: false,
      code: 'INVALID_DATE',
      field: 'date',
      reason: 'Date must be yyyy-MM-dd',
    }
  }

  const amount = parseCsvAmount(amountRaw)
  if (amount === null) {
    return {
      ok: false,
      code: 'INVALID_AMOUNT',
      field: 'amount',
      reason: 'Amount must be a positive number with at most 2 decimal places',
    }
  }
  if (amount > MAX_AMOUNT) {
    return {
      ok: false,
      code: 'AMOUNT_OUT_OF_RANGE',
      field: 'amount',
      reason: `Amount must be at most ${MAX_AMOUNT.toLocaleString()}`,
    }
  }

  const type = parseCsvType(typeRaw)
  if (!type) {
    return {
      ok: false,
      code: 'INVALID_TYPE',
      field: 'type',
      reason: 'Type must be Income or Expense',
    }
  }

  // Never auto-created, never fuzzy-matched — an unmatched category is always
  // an error row, not a guess.
  const categoryId = categoryByName.get(categoryRaw.toLowerCase())
  if (!categoryId) {
    return {
      ok: false,
      code: 'UNKNOWN_CATEGORY',
      field: 'category',
      reason: `Unknown category "${categoryRaw}"`,
    }
  }

  const note = noteRaw.trim()
  if (note.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      code: 'NOTE_TOO_LONG',
      field: 'note',
      reason: `Note must be at most ${MAX_NOTE_LENGTH} characters`,
    }
  }

  return {
    ok: true,
    value: {
      date,
      amount,
      isIncome: type === 'Income',
      categoryId,
      note: note.length > 0 ? note : null,
    },
  }
}
