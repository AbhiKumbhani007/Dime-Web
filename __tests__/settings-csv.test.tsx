import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ─── next/navigation ────────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings/data',
}))

// ─── lib/api/csv ────────────────────────────────────────────────────────────
const mockExportCsv = vi.fn()
const mockPreviewImport = vi.fn()
const mockCommitImport = vi.fn()

vi.mock('@/lib/api/csv', () => ({
  exportCsv: (...args: unknown[]) => mockExportCsv(...args),
  previewImport: (...args: unknown[]) => mockPreviewImport(...args),
  commitImport: (...args: unknown[]) => mockCommitImport(...args),
}))

// ─── lib/toast ──────────────────────────────────────────────────────────────
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('@/lib/toast', () => ({
  toastSuccess: (m: string) => mockToastSuccess(m),
  toastError: (m: string) => mockToastError(m),
  toastAction: vi.fn(),
}))

// IMPORTANT: We do NOT mock @tanstack/react-query — the page and modal use
// real useMutation hooks, which hit the mocked lib/api/csv module above.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import DataPage from '@/app/(app)/settings/data/page'
import type { PreviewResult, CommitResult } from '@/lib/api/csv'

function buildWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return Wrapper
}

function renderPage() {
  const Wrapper = buildWrapper()
  return render(<DataPage />, { wrapper: Wrapper })
}

function makeCsvFile(name = 'transactions.csv') {
  return new File(['Date,Amount,Type,Category,Note\n'], name, { type: 'text/csv' })
}

function selectFile(file: File) {
  const input = screen.getByTestId('csv-file-input') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

const mockPreview: PreviewResult = {
  previewToken: 'tok-1',
  fileName: 'transactions.csv',
  totalRows: 8,
  readyCount: 5,
  duplicateCount: 2,
  errorCount: 1,
  errors: [{ row: 3, raw: '{}', reason: 'Unknown category', code: 'UNKNOWN_CATEGORY', field: 'category' }],
  errorsTruncated: false,
  duplicates: [{ row: 4, date: '2026-01-01', amount: 100, note: 'Coffee' }],
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
}

const mockCommitResult: CommitResult = {
  imported: 5,
  skippedDuplicates: 2,
  skippedErrors: 1,
  totalRows: 8,
  driftedFromPreview: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── 1. Export triggers a download ──────────────────────────────────────────
describe('Export CSV', () => {
  it('clicking Export CSV downloads the returned blob', async () => {
    const blob = new Blob(['Date,Amount,Type,Category,Note\r\n'], { type: 'text/csv' })
    mockExportCsv.mockResolvedValueOnce(blob)

    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))

    await waitFor(() => {
      expect(mockExportCsv).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledWith(blob)
    })
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    clickSpy.mockRestore()
  })
})

// ─── 2. Selecting a file triggers preview and opens the modal ──────────────
describe('Import preview', () => {
  it('selecting a file previews it and opens the modal with correct counts', async () => {
    mockPreviewImport.mockResolvedValueOnce(mockPreview)

    renderPage()

    selectFile(makeCsvFile())

    await waitFor(() => {
      expect(mockPreviewImport).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('Import preview')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument() // ready
    expect(screen.getByText('2')).toBeInTheDocument() // duplicates
    expect(screen.getByText('1')).toBeInTheDocument() // errors
    expect(screen.getByText(/unknown category/i)).toBeInTheDocument()
  })

  // ─── 3. Confirm triggers commit and shows a success toast ────────────────
  it('confirming the import commits and shows a success toast', async () => {
    mockPreviewImport.mockResolvedValueOnce(mockPreview)
    mockCommitImport.mockResolvedValueOnce(mockCommitResult)

    renderPage()

    selectFile(makeCsvFile())

    await screen.findByText('Import preview')

    fireEvent.click(screen.getByRole('button', { name: /confirm import/i }))

    await waitFor(() => {
      expect(mockCommitImport).toHaveBeenCalledWith(expect.any(File), 'tok-1')
    })
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('Imported 5'))
    })

    // Modal closes on success
    await waitFor(() => {
      expect(screen.queryByText('Import preview')).not.toBeInTheDocument()
    })
  })

  // ─── 4. A mismatched-file 409 resets the flow with a clear message ───────
  it('shows an inline message and resets the flow on a 409 file mismatch', async () => {
    mockPreviewImport.mockResolvedValueOnce(mockPreview)
    const mismatchError = Object.assign(new Error('mismatch'), {
      response: { status: 409 },
    })
    mockCommitImport.mockRejectedValueOnce(mismatchError)

    renderPage()

    selectFile(makeCsvFile())
    await screen.findByText('Import preview')

    fireEvent.click(screen.getByRole('button', { name: /confirm import/i }))

    await screen.findByText(/re-select the file/i)
    expect(mockToastSuccess).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /choose a different file/i }))

    // Dialog closes and the staged file/preview are cleared
    await waitFor(() => {
      expect(screen.queryByText('Import preview')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('transactions.csv')).not.toBeInTheDocument()
  })
})
