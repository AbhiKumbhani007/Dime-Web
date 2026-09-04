import { api } from '@/lib/api'

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

export interface ImportDuplicateRow {
  row: number
  date: string
  amount: number
  note: string | null
}

export interface PreviewResult {
  previewToken: string
  fileName: string
  totalRows: number
  readyCount: number
  duplicateCount: number
  errorCount: number
  errors: ImportErrorRow[]
  errorsTruncated: boolean
  duplicates: ImportDuplicateRow[]
  expiresAt: string
}

export interface CommitResult {
  imported: number
  skippedDuplicates: number
  skippedErrors: number
  totalRows: number
  driftedFromPreview: boolean
}

export interface ExportCsvParams {
  from?: string
  to?: string
}

/**
 * Streams the raw CSV export. This is the only route in the API with no
 * JSON envelope — call `.blob()`, never `.json()`. Rate-limited to 10/min,
 * so callers must not wrap this in any retry/polling loop.
 */
export function exportCsv(params?: ExportCsvParams): Promise<Blob> {
  const searchParams: Record<string, string> = {}
  if (params?.from) searchParams.from = params.from
  if (params?.to) searchParams.to = params.to
  return api.get('api/csv/export', { searchParams }).blob()
}

/**
 * Uploads a CSV file for a dry-run preview. The caller must hold on to the
 * same `File` object for the eventual `commitImport` call — the backend
 * verifies the commit's file bytes hash-match the preview's, so re-sending
 * only the `previewToken` is not supported.
 */
export function previewImport(file: File): Promise<PreviewResult> {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('api/csv/import/preview', { body: formData }).json<PreviewResult>()
}

/**
 * Commits a previously previewed import. `file` must be the exact same File
 * object (same bytes) passed to `previewImport` — a 409 means the file
 * changed since the preview and the caller should have the user re-select
 * it and start over rather than retry.
 */
export function commitImport(file: File, previewToken: string): Promise<CommitResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('previewToken', previewToken)
  return api.post('api/csv/import/commit', { body: formData }).json<CommitResult>()
}
