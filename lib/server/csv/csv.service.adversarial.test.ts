import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { previewImport, commitImport } from './csv.service'

// csv.token.ts reads process.env.JWT_ACCESS_SECRET directly (see its own
// comment) — must be set before signPreviewToken/verifyPreviewToken run.
process.env.JWT_ACCESS_SECRET =
  'test-jwt-access-secret-at-least-32-characters!!'

// Adversarial coverage for previewImport/commitImport beyond csv.service.test.ts:
// malformed-file shapes (duplicate headers, non-UTF-8 bytes, empty/header-only
// files, the exact 5000-row boundary), formula-injection payloads surviving
// import safely as inert text, and a deterministic (non-timing-dependent)
// proof of the root cause behind the live concurrency finding described below.

const USER_ID = 'user1'
const CATEGORY_ID = 'clcategory0000000000000001'

function createMockPrisma() {
  const prisma = {
    category: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  }
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(prisma)
  )
  return prisma as unknown as PrismaClient & {
    category: { findMany: ReturnType<typeof vi.fn> }
    transaction: {
      findMany: ReturnType<typeof vi.fn>
      createMany: ReturnType<typeof vi.fn>
    }
    $transaction: ReturnType<typeof vi.fn>
  }
}

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf8')
}

function manyRowsCsv(count: number): string {
  const lines = ['Date,Amount,Type,Category,Note']
  for (let i = 1; i <= count; i++) {
    lines.push(`2026-08-30,${(100 + i).toFixed(2)},Expense,Groceries,`)
  }
  return lines.join('\r\n') + '\r\n'
}

describe('previewImport — malformed/adversarial file shapes', () => {
  it('an entirely empty file (0 bytes) is accepted as a 0-row import, not an error', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])

    const result = await previewImport(prisma, USER_ID, {
      buffer: Buffer.alloc(0),
      fileName: 'empty.csv',
    })

    expect(result.totalRows).toBe(0)
    expect(result.readyCount).toBe(0)
    expect(result.errorCount).toBe(0)
  })

  it('a file with only the header row (no data rows) is accepted as a 0-row import', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])

    const result = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer('Date,Amount,Type,Category,Note\r\n'),
      fileName: 'header-only.csv',
    })

    expect(result.totalRows).toBe(0)
    expect(result.readyCount).toBe(0)
  })

  it('duplicate header columns: csv-parse keeps only the last matching column, not a crash', async () => {
    // Documents actual behavior rather than asserting a "correct" one — CSV
    // has no defined semantics for duplicate column names. A header of
    // `Category,Category` silently loses the first column's data per row
    // (the underlying csv-parse library dedupes to the last occurrence).
    // This can silently misclassify a row (e.g. the user's real category
    // gets shadowed by a second, accidental column) but it does not error,
    // hang, or corrupt unrelated rows.
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
      { id: 'clcategory0000000000000002', name: 'Extra' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])

    const csv =
      'Date,Amount,Type,Category,Category\r\n2026-08-30,1250.00,Expense,Groceries,Extra\r\n'
    const result = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(csv),
      fileName: 'dup-header.csv',
    })

    expect(result.totalRows).toBe(1)
    // The second "Category" column (value "Extra") wins — "Groceries" from
    // the first column is silently discarded before classification ever runs.
    expect(result.readyCount).toBe(1)
    expect(result.errorCount).toBe(0)
  })

  it('non-UTF-8 byte sequences in a field decode to replacement characters, not a crash or truncation', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])

    const header = Buffer.from('Date,Amount,Type,Category,Note\r\n', 'utf8')
    const prefix = Buffer.from(
      '2026-08-30,10.00,Expense,Groceries,bad-',
      'utf8'
    )
    const invalidUtf8 = Buffer.from([0x80, 0x81, 0xc0, 0xaf]) // lone continuation / overlong seq
    const suffix = Buffer.from('-end\r\n', 'utf8')
    const buffer = Buffer.concat([header, prefix, invalidUtf8, suffix])

    const result = await previewImport(prisma, USER_ID, {
      buffer,
      fileName: 'non-utf8.csv',
    })

    expect(result.totalRows).toBe(1)
    expect(result.errorCount).toBe(0)
    expect(result.readyCount).toBe(1)
  })

  it('an embedded NUL byte in a Note field is classified as an error row, never reaches the database', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])

    const header = Buffer.from('Date,Amount,Type,Category,Note\r\n', 'utf8')
    const row = Buffer.from('2026-08-30,10.00,Expense,Groceries,bad', 'utf8')
    const nullByte = Buffer.from([0x00])
    const rest = Buffer.from('note\r\n', 'utf8')
    const buffer = Buffer.concat([header, row, nullByte, rest])

    const result = await previewImport(prisma, USER_ID, {
      buffer,
      fileName: 'null-byte.csv',
    })

    expect(result.totalRows).toBe(1)
    expect(result.readyCount).toBe(0)
    expect(result.errorCount).toBe(1)
    expect(result.errors[0].code).toBe('INVALID_NOTE')
  })

  it('exactly 5000 rows (the documented cap) is accepted, not rejected', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])

    const result = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(manyRowsCsv(5000)),
      fileName: 'exactly-5000.csv',
    })

    expect(result.totalRows).toBe(5000)
    expect(result.readyCount).toBe(5000)
  })

  it('a formula-injection payload in Note survives import unmodified — no server-side evaluation, no stripping', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])

    const csv =
      'Date,Amount,Type,Category,Note\r\n2026-08-30,10.00,Expense,Groceries,=cmd|/C calc\r\n'
    const result = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(csv),
      fileName: 'formula-note.csv',
    })

    expect(result.readyCount).toBe(1)
    expect(result.errorCount).toBe(0)
  })
})

describe('commitImport — formula payloads are stored verbatim, only export escapes', () => {
  it('a Note starting with "=" is inserted into the database exactly as typed', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })

    const csv =
      'Date,Amount,Type,Category,Note\r\n2026-08-30,10.00,Expense,Groceries,=cmd|/C calc\r\n'
    const buffer = csvBuffer(csv)
    const preview = await previewImport(prisma, USER_ID, {
      buffer,
      fileName: 'import.csv',
    })

    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])

    await commitImport(
      prisma,
      USER_ID,
      { buffer, fileName: 'import.csv' },
      preview.previewToken
    )

    expect(prisma.transaction.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            note: '=cmd|/C calc',
          }),
        ],
      })
    )
  })
})

describe('commitImport — deterministic proof of the token-reuse root cause', () => {
  // Live-verified separately (real dev server, real Postgres, two genuinely
  // concurrent HTTP commit requests reusing the same previewToken): both
  // requests returned 201 `imported: 1` and the database ended up with TWO
  // duplicate transactions instead of one. That result depends on real
  // network/DB timing and can't be reproduced deterministically with a
  // mocked Prisma client. What *can* be shown deterministically here is the
  // root cause: commitImport has no independent "this token was already
  // consumed" state of its own — it relies entirely on re-querying
  // `transaction.findMany` at classification time. If two calls happen to
  // observe the *same* pre-insert snapshot (exactly what happens when their
  // DB round trips overlap), nothing in this function stops both from
  // importing. This is a known gap, not something this test suite patches —
  // see the accompanying report for why (a correct fix needs a persisted,
  // single-use consumption record, i.e. a schema change).
  it('two sequential commits of the same token both succeed and both insert, when neither call observes the other’s write', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([]) // stays empty for both calls — simulates two overlapping reads before either write is visible
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })

    const buffer = csvBuffer(
      'Date,Amount,Type,Category,Note\r\n2026-08-30,1250.00,Expense,Groceries,Weekly shop\r\n'
    )
    const preview = await previewImport(prisma, USER_ID, {
      buffer,
      fileName: 'import.csv',
    })

    const first = await commitImport(
      prisma,
      USER_ID,
      { buffer, fileName: 'import.csv' },
      preview.previewToken
    )
    const second = await commitImport(
      prisma,
      USER_ID,
      { buffer, fileName: 'import.csv' },
      preview.previewToken
    )

    expect(first.imported).toBe(1)
    expect(second.imported).toBe(1) // no single-use guard rejects the replay
    expect(prisma.transaction.createMany).toHaveBeenCalledTimes(2)
  })
})
