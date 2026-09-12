import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  exportRows,
  exportFileName,
  previewImport,
  commitImport,
} from './csv.service'
import { hashFileBytes, signPreviewToken } from './csv.token'

// csv.service.ts has no dime-api counterpart test of its own — dime-api only
// exercises it indirectly through csv.test.ts's real-Fastify-instance route
// tests (this port's equivalent is app/api/csv/csv.routes.test.ts, T024).
// This file unit-tests the four exported service functions directly against
// a mocked Prisma client, matching transactions.service.test.ts's style.

process.env.JWT_ACCESS_SECRET =
  'test-jwt-access-secret-at-least-32-characters!!'

const USER_ID = 'user1'
const CATEGORY_ID = 'clcategory0000000000000001'

function createMockPrisma() {
  const prisma = {
    category: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), createMany: vi.fn() },
    consumedPreviewToken: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(),
  }
  // Runs the callback against the same mock object, so `tx.*` inside
  // commitImport's $transaction resolves via the same mocks as everywhere
  // else in this file — same pattern as transactions.service.test.ts.
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(prisma)
  )
  return prisma as unknown as PrismaClient & {
    category: { findMany: ReturnType<typeof vi.fn> }
    transaction: {
      findMany: ReturnType<typeof vi.fn>
      createMany: ReturnType<typeof vi.fn>
    }
    consumedPreviewToken: {
      create: ReturnType<typeof vi.fn>
      deleteMany: ReturnType<typeof vi.fn>
    }
    $transaction: ReturnType<typeof vi.fn>
  }
}

function makeTransactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cltx0000000000000000000001',
    amount: 1250,
    date: new Date('2026-08-30T00:00:00.000Z'),
    note: 'Weekly shop',
    isIncome: false,
    userId: USER_ID,
    categoryId: CATEGORY_ID,
    category: { id: CATEGORY_ID, name: 'Groceries' },
    ...overrides,
  }
}

const VALID_CSV =
  'Date,Amount,Type,Category,Note\r\n2026-08-30,1250.00,Expense,Groceries,Weekly shop\r\n'

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf8')
}

// Generates `count` distinct-amount rows so every dupKey differs — used to
// exercise commit's 500-row chunking without any row classifying as a
// duplicate of another.
function manyRowsCsv(count: number): string {
  const lines = ['Date,Amount,Type,Category,Note']
  for (let i = 1; i <= count; i++) {
    lines.push(`2026-08-30,${(100 + i).toFixed(2)},Expense,Groceries,`)
  }
  return lines.join('\r\n') + '\r\n'
}

describe('exportRows', () => {
  it('yields the BOM then the header row first, even with no transactions', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    const chunks: string[] = []
    for await (const chunk of exportRows(prisma, USER_ID, {}))
      chunks.push(chunk)

    expect(chunks[0]).toBe('﻿')
    expect(chunks[1]).toBe('Date,Amount,Type,Category,Note\r\n')
    expect(chunks).toHaveLength(2)
  })

  it('yields one CSV line per transaction, in the source order', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany
      .mockResolvedValueOnce([makeTransactionRow()])
      .mockResolvedValueOnce([])

    const chunks: string[] = []
    for await (const chunk of exportRows(prisma, USER_ID, {}))
      chunks.push(chunk)

    expect(chunks).toContain(
      '2026-08-30,1250.00,Expense,Groceries,Weekly shop\r\n'
    )
  })

  it('quotes a note containing a comma and doubles internal quotes', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        makeTransactionRow({ note: 'Fruit, veg, and a "treat"' }),
      ])
      .mockResolvedValueOnce([])

    const chunks: string[] = []
    for await (const chunk of exportRows(prisma, USER_ID, {}))
      chunks.push(chunk)

    expect(chunks.join('')).toContain('"Fruit, veg, and a ""treat"""')
  })

  it('renders an empty note as an empty CSV field, not the string "null"', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany
      .mockResolvedValueOnce([makeTransactionRow({ note: null })])
      .mockResolvedValueOnce([])

    const chunks: string[] = []
    for await (const chunk of exportRows(prisma, USER_ID, {}))
      chunks.push(chunk)

    expect(chunks.join('')).toContain(
      '2026-08-30,1250.00,Expense,Groceries,\r\n'
    )
  })

  it('scopes the query to userId, with no date filter when from/to are absent', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])

    for await (const _ of exportRows(prisma, USER_ID, {})) void _

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.where).toEqual({ userId: USER_ID })
  })

  it('applies from/to as a date filter', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValue([])
    const from = new Date('2026-01-01T00:00:00.000Z')
    const to = new Date('2026-12-31T00:00:00.000Z')

    for await (const _ of exportRows(prisma, USER_ID, { from, to })) void _

    const args = prisma.transaction.findMany.mock.calls[0]?.[0]
    expect(args.where.date).toEqual({ gte: from, lte: to })
  })

  it('paginates via cursor: a full page continues, a short page ends the loop', async () => {
    const prisma = createMockPrisma()
    const fullPage = Array.from({ length: 500 }, (_, i) =>
      makeTransactionRow({ id: `cltx${String(i).padStart(23, '0')}` })
    )
    prisma.transaction.findMany
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([])

    const chunks: string[] = []
    for await (const chunk of exportRows(prisma, USER_ID, {}))
      chunks.push(chunk)

    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(2)
    const secondCallArgs = prisma.transaction.findMany.mock.calls[1]?.[0]
    expect(secondCallArgs.cursor).toEqual({
      id: fullPage[fullPage.length - 1].id,
    })
    expect(secondCallArgs.skip).toBe(1)
    // BOM + header + 500 data rows
    expect(chunks).toHaveLength(502)
  })

  it('stops immediately (one call) when the first page is already short', async () => {
    const prisma = createMockPrisma()
    prisma.transaction.findMany.mockResolvedValueOnce([makeTransactionRow()])

    const chunks: string[] = []
    for await (const chunk of exportRows(prisma, USER_ID, {}))
      chunks.push(chunk)

    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1)
  })
})

describe('exportFileName', () => {
  it('formats as paisa-export-<yyyy-MM-dd>.csv for the given date', () => {
    expect(exportFileName(new Date('2026-09-04T16:54:08.000Z'))).toBe(
      'paisa-export-2026-09-04.csv'
    )
  })

  it('defaults to the current date when none is given', () => {
    const name = exportFileName()
    expect(name).toMatch(/^paisa-export-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})

describe('previewImport', () => {
  it('a valid, non-duplicate row → all ready, counts sum to totalRows', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])

    const result = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(VALID_CSV),
      fileName: 'import.csv',
    })

    expect(result.totalRows).toBe(1)
    expect(result.readyCount).toBe(1)
    expect(result.duplicateCount).toBe(0)
    expect(result.errorCount).toBe(0)
    expect(result.readyCount + result.duplicateCount + result.errorCount).toBe(
      result.totalRows
    )
    expect(result.previewToken).toEqual(expect.any(String))
    expect(result.expiresAt).toEqual(expect.any(String))
  })

  it('signs a previewToken whose TTL is ~30 minutes out', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    const before = Date.now()

    const result = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(VALID_CSV),
      fileName: 'import.csv',
    })

    const expiresAtMs = new Date(result.expiresAt).getTime()
    expect(expiresAtMs).toBeGreaterThan(before + 29 * 60 * 1000)
    expect(expiresAtMs).toBeLessThan(before + 31 * 60 * 1000)
  })

  it('export → import preview round trip shows 100% duplicates', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([
      {
        date: new Date('2026-08-30T00:00:00.000Z'),
        amount: 1250,
        note: 'Weekly shop',
      },
    ])

    const result = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(VALID_CSV),
      fileName: 'export.csv',
    })

    expect(result.totalRows).toBe(1)
    expect(result.duplicateCount).toBe(1)
    expect(result.readyCount).toBe(0)
    expect(result.errorCount).toBe(0)
  })

  it('an unknown category → an UNKNOWN_CATEGORY error row, never auto-created', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([])
    prisma.transaction.findMany.mockResolvedValue([])

    const result = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(VALID_CSV),
      fileName: 'import.csv',
    })

    expect(result.errorCount).toBe(1)
    expect(result.errors[0].code).toBe('UNKNOWN_CATEGORY')
  })

  it('missing a required header column → rejects with a 400 httpError', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    const csv =
      'Date,Amount,Category,Note\r\n2026-08-30,1250.00,Groceries,Weekly shop\r\n'

    await expect(
      previewImport(prisma, USER_ID, {
        buffer: csvBuffer(csv),
        fileName: 'import.csv',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/Type/),
    })
  })

  it('more than 5000 rows → rejects with a 400 httpError', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])

    await expect(
      previewImport(prisma, USER_ID, {
        buffer: csvBuffer(manyRowsCsv(5001)),
        fileName: 'import.csv',
      })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('an unparseable file → rejects with a 400 httpError', async () => {
    const prisma = createMockPrisma()

    await expect(
      previewImport(prisma, USER_ID, {
        buffer: csvBuffer('"unterminated quote,\r\n'),
        fileName: 'import.csv',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Could not parse CSV file',
    })
  })
})

describe('commitImport', () => {
  async function getToken(
    prisma: ReturnType<typeof createMockPrisma>,
    csv: string,
    overrides: Record<string, unknown> = {}
  ) {
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    const result = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(csv),
      fileName: 'import.csv',
    })
    if (Object.keys(overrides).length === 0) return result.previewToken
    // Re-sign with overrides applied, for tests that need a token whose
    // claims disagree with the actual file (userId mismatch, stale counts).
    return signPreviewToken({
      userId: USER_ID,
      fileHash: hashFileBytes(csvBuffer(csv)),
      readyCount: result.readyCount,
      duplicateCount: result.duplicateCount,
      errorCount: result.errorCount,
      ...overrides,
    })
  }

  it('matching file + token → imports the ready rows via one $transaction', async () => {
    const prisma = createMockPrisma()
    const previewToken = await getToken(prisma, VALID_CSV)

    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })

    const result = await commitImport(
      prisma,
      USER_ID,
      { buffer: csvBuffer(VALID_CSV), fileName: 'import.csv' },
      previewToken
    )

    expect(result.imported).toBe(1)
    expect(result.driftedFromPreview).toBe(false)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.transaction.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            amount: 1250,
            categoryId: CATEGORY_ID,
            userId: USER_ID,
          }),
        ],
      })
    )
  })

  it('malformed token → rejects with 400, never touches the database', async () => {
    const prisma = createMockPrisma()

    await expect(
      commitImport(
        prisma,
        USER_ID,
        { buffer: csvBuffer(VALID_CSV), fileName: 'import.csv' },
        'not-a-real-token'
      )
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    expect(prisma.category.findMany).not.toHaveBeenCalled()
  })

  it('a token issued to a different user → rejects with 400, never touches the database', async () => {
    const prisma = createMockPrisma()
    const previewToken = await getToken(prisma, VALID_CSV, {
      userId: 'a-different-user',
    })

    await expect(
      commitImport(
        prisma,
        USER_ID,
        { buffer: csvBuffer(VALID_CSV), fileName: 'import.csv' },
        previewToken
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid preview token',
    })
    expect(prisma.transaction.createMany).not.toHaveBeenCalled()
  })

  it('an expired token → rejects with 400 mentioning re-upload', async () => {
    const prisma = createMockPrisma()
    const previewToken = await getToken(prisma, VALID_CSV, {
      exp: Date.now() - 1000,
    })

    await expect(
      commitImport(
        prisma,
        USER_ID,
        { buffer: csvBuffer(VALID_CSV), fileName: 'import.csv' },
        previewToken
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/upload the file again/),
    })
  })

  it('a different file than the one previewed → rejects with 409, never touches the database', async () => {
    const prisma = createMockPrisma()
    const previewToken = await getToken(prisma, VALID_CSV)

    const differentCsv =
      'Date,Amount,Type,Category,Note\r\n2026-01-01,10.00,Expense,Groceries,\r\n'

    await expect(
      commitImport(
        prisma,
        USER_ID,
        { buffer: csvBuffer(differentCsv), fileName: 'import.csv' },
        previewToken
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'The selected file does not match the previewed file',
    })
    expect(prisma.transaction.createMany).not.toHaveBeenCalled()
  })

  it('data added between preview and commit → driftedFromPreview: true, reclassified as a duplicate', async () => {
    const prisma = createMockPrisma()
    const previewToken = await getToken(prisma, VALID_CSV)

    // Between preview and commit, this exact row was added to the DB by some
    // other means — the commit-time reclassification pass must catch it.
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([
      {
        date: new Date('2026-08-30T00:00:00.000Z'),
        amount: 1250,
        note: 'Weekly shop',
      },
    ])

    const result = await commitImport(
      prisma,
      USER_ID,
      { buffer: csvBuffer(VALID_CSV), fileName: 'import.csv' },
      previewToken
    )

    expect(result.driftedFromPreview).toBe(true)
    expect(result.imported).toBe(0)
    expect(result.skippedDuplicates).toBe(1)
    expect(prisma.transaction.createMany).not.toHaveBeenCalled()
  })

  it('re-classifies from scratch rather than trusting the preview payload', async () => {
    // Re-classification means the commit calls category.findMany/transaction.findMany
    // itself, exactly like previewImport did — it never reuses the preview's result.
    const prisma = createMockPrisma()
    const previewToken = await getToken(prisma, VALID_CSV)
    vi.mocked(prisma.category.findMany).mockClear()
    vi.mocked(prisma.transaction.findMany).mockClear()

    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })

    await commitImport(
      prisma,
      USER_ID,
      { buffer: csvBuffer(VALID_CSV), fileName: 'import.csv' },
      previewToken
    )

    expect(prisma.category.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1)
  })

  it('bulk-inserts more than 500 ready rows in more than one chunk, inside a single $transaction', async () => {
    const prisma = createMockPrisma()
    const csv = manyRowsCsv(501)
    const previewToken = await getToken(prisma, csv)

    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.createMany.mockResolvedValue({ count: 500 })

    const result = await commitImport(
      prisma,
      USER_ID,
      { buffer: csvBuffer(csv), fileName: 'import.csv' },
      previewToken
    )

    expect(result.imported).toBe(501)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.transaction.createMany).toHaveBeenCalledTimes(2)
    expect(prisma.transaction.createMany.mock.calls[0][0].data).toHaveLength(
      500
    )
    expect(prisma.transaction.createMany.mock.calls[1][0].data).toHaveLength(1)
  })

  it('a failure partway through the chunk loop propagates rather than completing a partial import', async () => {
    // The chunk loop runs inside one prisma.$transaction callback — a real
    // Postgres transaction rolls back everything already written in that
    // callback when it rejects. This asserts the rejection actually
    // propagates out of commitImport (nothing here swallows it into a
    // partial success), which is the half of that guarantee this mocked
    // Prisma client can exercise.
    const prisma = createMockPrisma()
    const csv = manyRowsCsv(501)
    const previewToken = await getToken(prisma, csv)

    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.createMany
      .mockResolvedValueOnce({ count: 500 })
      .mockRejectedValueOnce(new Error('connection lost mid-chunk'))

    await expect(
      commitImport(
        prisma,
        USER_ID,
        { buffer: csvBuffer(csv), fileName: 'import.csv' },
        previewToken
      )
    ).rejects.toThrow('connection lost mid-chunk')
  })
})

describe('csv schemas', () => {
  it('accepts a valid ISO from/to pair', async () => {
    const { ExportQuerySchema } = await import('./csv.schema')
    const result = ExportQuerySchema.safeParse({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid from date', async () => {
    const { ExportQuerySchema } = await import('./csv.schema')
    const result = ExportQuerySchema.safeParse({ from: 'not-a-date' })
    expect(result.success).toBe(false)
  })

  it('accepts an empty query (both dates optional)', async () => {
    const { ExportQuerySchema } = await import('./csv.schema')
    const result = ExportQuerySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects a blank previewToken', async () => {
    const { CommitFieldsSchema } = await import('./csv.schema')
    const result = CommitFieldsSchema.safeParse({ previewToken: '' })
    expect(result.success).toBe(false)
  })

  it('accepts a non-empty previewToken', async () => {
    const { CommitFieldsSchema } = await import('./csv.schema')
    const result = CommitFieldsSchema.safeParse({ previewToken: 'abc.def' })
    expect(result.success).toBe(true)
  })
})
