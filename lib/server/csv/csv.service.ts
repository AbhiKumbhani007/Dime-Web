import 'server-only'
import { parse } from 'csv-parse/sync'
import type { PrismaClient, Transaction, Category } from '@prisma/client'
import {
  formatCsvDate,
  classifyRow,
  dupKey,
  type CsvRow,
  type ParsedRow,
  type ImportErrorRow,
} from './csv.parse'
import {
  hashFileBytes,
  signPreviewToken,
  verifyPreviewToken,
} from './csv.token'
import type { ExportQuery } from './csv.schema'
import { httpError } from '@/lib/server/httpError'

const MAX_ROWS = 5000
const MAX_ERROR_SAMPLES = 100
const MAX_DUPLICATE_SAMPLES = 20
const EXPORT_PAGE_SIZE = 500
const COMMIT_CHUNK_SIZE = 500
const REQUIRED_COLUMNS = ['Date', 'Amount', 'Type', 'Category']

// ── Export ───────────────────────────────────────────────────────────────────

// A leading =, +, -, or @ makes Excel/Sheets/LibreOffice read the cell's
// *logical* value as a formula rather than literal text when the file is
// opened (CWE-1236 "CSV injection") — RFC-4180 quoting alone doesn't defend
// against this, since it only escapes delimiters/quotes/newlines and a
// spreadsheet app still evaluates the unquoted value. Mitigated the standard
// way: prefix a single quote, which every major spreadsheet app treats as a
// "force text" marker and does not display.
function neutralizeFormulaPrefix(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

function toCsvField(value: string): string {
  const safe = neutralizeFormulaPrefix(value)
  if (/["\r\n,]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`
  return safe
}

function formatCsvRow(row: Transaction & { category: Category }): string {
  return [
    formatCsvDate(row.date),
    row.amount.toFixed(2),
    row.isIncome ? 'Income' : 'Expense',
    toCsvField(row.category.name),
    toCsvField(row.note ?? ''),
  ].join(',')
}

// Buffered in memory by the route layer via `for await` (see the Architecture
// table) rather than streamed — this stays an async generator with a cursor
// loop regardless, in case a user has more rows than fit comfortably in
// memory at once. This is the only route in the API with no JSON envelope.
export async function* exportRows(
  prisma: PrismaClient,
  userId: string,
  query: ExportQuery
): AsyncGenerator<string> {
  yield '﻿' // BOM — the importer's `bom: true` option strips this back off.
  yield 'Date,Amount,Type,Category,Note\r\n'

  const where: Record<string, unknown> = { userId }
  if (query.from || query.to) {
    const dateFilter: Record<string, Date> = {}
    if (query.from) dateFilter.gte = query.from
    if (query.to) dateFilter.lte = query.to
    where.date = dateFilter
  }

  let cursor: string | undefined
  for (;;) {
    const rows = (await prisma.transaction.findMany({
      where,
      include: { category: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: EXPORT_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })) as Array<Transaction & { category: Category }>

    if (rows.length === 0) break
    for (const row of rows) yield formatCsvRow(row) + '\r\n'
    if (rows.length < EXPORT_PAGE_SIZE) break
    cursor = rows[rows.length - 1].id
  }
}

export function exportFileName(now: Date = new Date()): string {
  return `paisa-export-${formatCsvDate(now)}.csv`
}

// ── Import: shared classification pass ──────────────────────────────────────

interface ClassifiedFile {
  totalRows: number
  ready: ParsedRow[]
  readyCount: number
  duplicateCount: number
  errorCount: number
  errors: ImportErrorRow[]
  errorsTruncated: boolean
  duplicateSamples: Array<{
    row: number
    date: string
    amount: number
    note: string | null
  }>
}

async function classifyFile(
  prisma: PrismaClient,
  userId: string,
  buffer: Buffer
): Promise<ClassifiedFile> {
  let records: CsvRow[]
  try {
    records = parse(buffer, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })
  } catch {
    throw httpError(400, 'Could not parse CSV file')
  }

  if (records.length > MAX_ROWS) {
    throw httpError(400, `CSV has too many rows (max ${MAX_ROWS})`)
  }

  if (records.length > 0) {
    const headerKeys = Object.keys(records[0])
    const missing = REQUIRED_COLUMNS.filter((col) => !headerKeys.includes(col))
    if (missing.length > 0) {
      throw httpError(
        400,
        `CSV is missing required column(s): ${missing.join(', ')}`
      )
    }
  }

  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true },
  })
  const categoryByName = new Map(
    categories.map((c) => [c.name.trim().toLowerCase(), c.id])
  )

  const existing = await prisma.transaction.findMany({
    where: { userId },
    select: { date: true, amount: true, note: true },
  })
  // Accumulates as rows are accepted below, so in-file duplicates are caught too.
  const seen = new Set(existing.map((t) => dupKey(t)))

  const ready: ParsedRow[] = []
  const errors: ImportErrorRow[] = []
  const duplicateSamples: ClassifiedFile['duplicateSamples'] = []
  let errorCount = 0
  let duplicateCount = 0

  records.forEach((record, index) => {
    const row = index + 1
    const result = classifyRow(record, categoryByName)

    if (!result.ok) {
      errorCount++
      if (errors.length < MAX_ERROR_SAMPLES) {
        errors.push({
          row,
          raw: JSON.stringify(record),
          code: result.code,
          field: result.field,
          reason: result.reason,
        })
      }
      return
    }

    const key = dupKey(result.value)
    if (seen.has(key)) {
      duplicateCount++
      if (duplicateSamples.length < MAX_DUPLICATE_SAMPLES) {
        duplicateSamples.push({
          row,
          date: formatCsvDate(result.value.date),
          amount: result.value.amount,
          note: result.value.note,
        })
      }
      return
    }

    seen.add(key)
    ready.push(result.value)
  })

  return {
    totalRows: records.length,
    ready,
    readyCount: ready.length,
    duplicateCount,
    errorCount,
    errors,
    errorsTruncated: errorCount > errors.length,
    duplicateSamples,
  }
}

// ── Import: preview ──────────────────────────────────────────────────────────

export interface PreviewResult {
  previewToken: string
  fileName: string
  totalRows: number
  readyCount: number
  duplicateCount: number
  errorCount: number
  errors: ImportErrorRow[]
  errorsTruncated: boolean
  duplicates: ClassifiedFile['duplicateSamples']
  expiresAt: string
}

export async function previewImport(
  prisma: PrismaClient,
  userId: string,
  file: { buffer: Buffer; fileName: string }
): Promise<PreviewResult> {
  const classified = await classifyFile(prisma, userId, file.buffer)

  const exp = Date.now() + 30 * 60 * 1000
  const previewToken = signPreviewToken({
    userId,
    fileHash: hashFileBytes(file.buffer),
    readyCount: classified.readyCount,
    duplicateCount: classified.duplicateCount,
    errorCount: classified.errorCount,
    exp,
  })

  return {
    previewToken,
    fileName: file.fileName,
    totalRows: classified.totalRows,
    readyCount: classified.readyCount,
    duplicateCount: classified.duplicateCount,
    errorCount: classified.errorCount,
    errors: classified.errors,
    errorsTruncated: classified.errorsTruncated,
    duplicates: classified.duplicateSamples,
    expiresAt: new Date(exp).toISOString(),
  }
}

// ── Import: commit ───────────────────────────────────────────────────────────

export interface CommitResult {
  imported: number
  skippedDuplicates: number
  skippedErrors: number
  totalRows: number
  driftedFromPreview: boolean
}

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size)
    chunks.push(items.slice(i, i + size))
  return chunks
}

export async function commitImport(
  prisma: PrismaClient,
  userId: string,
  file: { buffer: Buffer; fileName: string },
  previewToken: string
): Promise<CommitResult> {
  const verified = verifyPreviewToken(previewToken)
  if (!verified.ok) {
    const message =
      verified.reason === 'EXPIRED'
        ? 'This import preview has expired — upload the file again'
        : 'Invalid preview token'
    throw httpError(400, message)
  }
  if (verified.payload.userId !== userId) {
    throw httpError(400, 'Invalid preview token')
  }

  const fileHash = hashFileBytes(file.buffer)
  if (fileHash !== verified.payload.fileHash) {
    throw httpError(409, 'The selected file does not match the previewed file')
  }

  // Stateless by design: re-parse and re-classify from scratch rather than
  // trusting a staged result, since another transaction may have been added
  // between preview and commit.
  const classified = await classifyFile(prisma, userId, file.buffer)

  const driftedFromPreview =
    classified.readyCount !== verified.payload.readyCount ||
    classified.duplicateCount !== verified.payload.duplicateCount ||
    classified.errorCount !== verified.payload.errorCount

  // All-or-nothing — a partial import is worse than a failed one. A failure
  // partway through this loop rejects the whole $transaction callback, which
  // Postgres rolls back in full; nothing here catches that rejection, so it
  // propagates straight out of commitImport.
  await prisma.$transaction(
    async (tx) => {
      for (const chunk of chunksOf(classified.ready, COMMIT_CHUNK_SIZE)) {
        await tx.transaction.createMany({
          data: chunk.map((row) => ({
            amount: row.amount,
            date: row.date,
            note: row.note,
            isIncome: row.isIncome,
            categoryId: row.categoryId,
            userId,
          })),
        })
      }
    },
    { timeout: 30_000 }
  )

  return {
    imported: classified.readyCount,
    skippedDuplicates: classified.duplicateCount,
    skippedErrors: classified.errorCount,
    totalRows: classified.totalRows,
    driftedFromPreview,
  }
}
