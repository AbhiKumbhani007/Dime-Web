import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── next/navigation ────────────────────────────────────────────────────────
// Kept stable across calls — see the note in ledger.test.tsx — an unstable
// mock router object here previously caused an infinite render loop via
// usePageChrome's useMemo.
const mockPush = vi.fn()
const mockRouter = { push: mockPush, replace: vi.fn() }
const mockUseSearchParams = vi.fn(() => new URLSearchParams())
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/ledger',
  useSearchParams: () => mockUseSearchParams(),
}))

// ─── lib/api/ledger ─────────────────────────────────────────────────────────
vi.mock('@/lib/api/ledger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/ledger')>('@/lib/api/ledger')
  return {
    ...actual,
    getLedgerPeople: vi.fn(),
    createLedgerPerson: vi.fn(),
    getLedgerPerson: vi.fn(),
    updateLedgerPerson: vi.fn(),
    deleteLedgerPerson: vi.fn(),
    getLedgerPersonEntries: vi.fn(),
    createLedgerEntry: vi.fn(),
    updateLedgerEntry: vi.fn(),
    deleteLedgerEntry: vi.fn(),
    settleLedgerPerson: vi.fn(),
  }
})

// ─── hooks/useLedger ────────────────────────────────────────────────────────
const mockCreateEntryMutateAsync = vi.fn()
const mockUpdateEntryMutateAsync = vi.fn()
const mockDeleteEntryMutateAsync = vi.fn()
const mockSettlePersonMutateAsync = vi.fn()
const mockUseLedgerPeople = vi.fn()
const mockUseLedgerEntries = vi.fn()

vi.mock('@/hooks/useLedger', () => ({
  LEDGER_PEOPLE_KEY: ['ledger', 'people'],
  ledgerEntriesKey: (id: string) => ['ledger', 'people', id, 'entries'],
  useLedgerPeople: () => mockUseLedgerPeople(),
  useLedgerEntries: (id?: string) => mockUseLedgerEntries(id),
  useCreateLedgerPerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateLedgerPerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLedgerPerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateLedgerEntry: () => ({ mutateAsync: mockCreateEntryMutateAsync, isPending: false }),
  useUpdateLedgerEntry: () => ({ mutateAsync: mockUpdateEntryMutateAsync, isPending: false }),
  useDeleteLedgerEntry: () => ({ mutateAsync: mockDeleteEntryMutateAsync, isPending: false }),
  useSettleLedgerPerson: () => ({ mutateAsync: mockSettlePersonMutateAsync, isPending: false }),
}))

// ─── @tanstack/react-query ──────────────────────────────────────────────────
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
  useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('@/lib/toast', () => ({
  toastSuccess: (m: string) => mockToastSuccess(m),
  toastError: (m: string) => mockToastError(m),
  toastAction: vi.fn(),
}))

import { EntryForm } from '@/components/ledger/EntryForm'
import { EntryRow } from '@/components/ledger/EntryRow'
import { PersonDetailHeader } from '@/components/ledger/PersonDetailHeader'
import { SettleDialog } from '@/components/ledger/SettleDialog'
import { DeleteEntryDialog } from '@/components/ledger/DeleteEntryDialog'
import { AllSquareState } from '@/components/ledger/EmptyStates'
import LedgerPage from '@/app/(app)/ledger/page'
import type { LedgerEntry, LedgerPerson, LedgerSummary } from '@/lib/api/ledger'

function makePerson(overrides: Partial<LedgerPerson> = {}): LedgerPerson {
  return {
    id: 'person-1',
    name: 'Priya Nair',
    phone: null,
    note: 'Flatmate',
    color: '#6366f1',
    balance: 500,
    direction: 'OWED_TO_YOU',
    activeEntryCount: 1,
    settledEntryCount: 0,
    lastActivityAt: '2026-08-12T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  }
}

function makeEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: 'entry-1',
    amount: 500,
    type: 'GAVE',
    date: '2026-08-12T00:00:00.000Z',
    note: 'Movie tickets',
    settled: false,
    settledAt: null,
    personId: 'person-1',
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  }
}

function makeSummary(overrides: Partial<LedgerSummary> = {}): LedgerSummary {
  return {
    youAreOwed: 500,
    youOwe: 0,
    netPosition: 500,
    personCount: 1,
    settledPeople: 0,
    settledEntries: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseSearchParams.mockReturnValue(new URLSearchParams())
  mockUseLedgerPeople.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  mockUseLedgerEntries.mockReturnValue({ data: undefined, isLoading: false })
})

// ─── PersonDetailHeader — settle button disabled state ─────────────────────

describe('PersonDetailHeader', () => {
  it('disables Settle up when the person is already settled', () => {
    render(
      <PersonDetailHeader
        person={makePerson({ direction: 'SETTLED', balance: 0 })}
        onAddEntry={vi.fn()}
        onSettle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Settle up' })).toBeDisabled()
  })

  it('enables Settle up for an outstanding balance and shows the note pill', () => {
    render(
      <PersonDetailHeader
        person={makePerson({ direction: 'OWED_TO_YOU', balance: 500, note: 'Flatmate' })}
        onAddEntry={vi.fn()}
        onSettle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Settle up' })).toBeEnabled()
    expect(screen.getByText('Flatmate')).toBeInTheDocument()
  })

  it('only renders Close when onClose is provided', () => {
    const { rerender } = render(
      <PersonDetailHeader person={makePerson()} onAddEntry={vi.fn()} onSettle={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(screen.queryByLabelText('Close panel')).not.toBeInTheDocument()

    rerender(
      <PersonDetailHeader
        person={makePerson()}
        onAddEntry={vi.fn()}
        onSettle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Close panel')).toBeInTheDocument()
  })
})

// ─── EntryForm ───────────────────────────────────────────────────────────────

describe('EntryForm', () => {
  it('defaults to "I gave" and flips the live preview when switched to "I received"', async () => {
    const user = userEvent.setup()
    render(<EntryForm open personId="person-1" firstName="Priya" onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Amount'), '250')
    expect(screen.getByText(/Balance goes up by/)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /I received/ }))
    expect(screen.getByText(/Balance goes down by/)).toBeInTheDocument()
  })

  it('pre-fills from the entry prop and calls update, not create, on submit', async () => {
    const user = userEvent.setup()
    const entry = makeEntry({ id: 'entry-9', amount: 750, type: 'RECEIVED', note: 'Partial repayment' })
    mockUpdateEntryMutateAsync.mockResolvedValue({ entry, person: makePerson() })

    render(<EntryForm open personId="person-1" firstName="Priya" entry={entry} onClose={vi.fn()} />)

    expect(screen.getByDisplayValue('750')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Partial repayment')).toBeInTheDocument()
    expect(screen.getByText('Edit entry with Priya')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockUpdateEntryMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'entry-9', data: expect.objectContaining({ amount: 750 }) }),
      )
    })
    expect(mockCreateEntryMutateAsync).not.toHaveBeenCalled()
  })

  it('rejects a zero amount', async () => {
    const user = userEvent.setup()
    render(<EntryForm open personId="person-1" firstName="Priya" onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByText(/Amount is required|greater than 0/)).toBeInTheDocument()
    expect(mockCreateEntryMutateAsync).not.toHaveBeenCalled()
  })
})

// ─── EntryRow ────────────────────────────────────────────────────────────────

describe('EntryRow', () => {
  it('active variant renders edit/delete, wired to the callbacks', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const entry = makeEntry()
    render(<EntryRow entry={entry} variant="active" onEdit={onEdit} onDelete={onDelete} />)

    await user.click(screen.getByLabelText(`Edit entry: ${entry.note}`))
    expect(onEdit).toHaveBeenCalledWith(entry)

    await user.click(screen.getByLabelText(`Delete entry: ${entry.note}`))
    expect(onDelete).toHaveBeenCalledWith(entry)
  })

  it('settled variant renders no action buttons and strikes the note', () => {
    const entry = makeEntry({ settled: true, settledAt: '2026-08-13T00:00:00.000Z' })
    render(<EntryRow entry={entry} variant="settled" />)

    expect(screen.queryByLabelText(`Edit entry: ${entry.note}`)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(`Delete entry: ${entry.note}`)).not.toBeInTheDocument()
    expect(screen.getByText(entry.note!)).toHaveClass('line-through')
  })
})

// ─── SettleDialog / DeleteEntryDialog ────────────────────────────────────────

describe('SettleDialog', () => {
  it('confirms, settles, and toasts success', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mockSettlePersonMutateAsync.mockResolvedValue({
      person: makePerson({ direction: 'SETTLED', balance: 0 }),
      settledCount: 1,
      settledAmount: 500,
      settledAt: '2026-09-01T00:00:00.000Z',
    })

    render(<SettleDialog person={makePerson({ id: 'p1', balance: 500 })} open onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: /Settle ₹500/ }))

    await waitFor(() => expect(mockSettlePersonMutateAsync).toHaveBeenCalledWith({ expectedBalance: 500 }))
    expect(mockToastSuccess).toHaveBeenCalledWith('Settled — balance is ₹0')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('toasts an error and still closes when the settle request fails', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mockSettlePersonMutateAsync.mockRejectedValue(new Error('boom'))

    render(<SettleDialog person={makePerson()} open onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: /Settle/ }))

    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('DeleteEntryDialog', () => {
  it('confirms and deletes the given entry id', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mockDeleteEntryMutateAsync.mockResolvedValue(undefined)
    const entry = makeEntry({ id: 'entry-7' })

    render(<DeleteEntryDialog entry={entry} personId="person-1" open onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: 'Delete entry' }))

    await waitFor(() => expect(mockDeleteEntryMutateAsync).toHaveBeenCalledWith('entry-7'))
    expect(mockToastSuccess).toHaveBeenCalledWith('Entry deleted')
  })
})

// ─── AllSquareState ──────────────────────────────────────────────────────────

describe('AllSquareState', () => {
  it('names the person', () => {
    render(<AllSquareState firstName="Kabir" />)
    expect(screen.getByText('All square with Kabir')).toBeInTheDocument()
  })
})

// ─── LedgerPage — detail mode ────────────────────────────────────────────────

describe('LedgerPage detail mode', () => {
  it('shows the all-square state when there are no active entries', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('person=p1'))
    const person = makePerson({ id: 'p1', name: 'Kabir Shah', direction: 'SETTLED', balance: 0 })
    mockUseLedgerPeople.mockReturnValue({ data: { people: [person], summary: makeSummary() }, isLoading: false, isError: false })
    mockUseLedgerEntries.mockReturnValue({ data: { person, active: [], settled: [] }, isLoading: false })

    render(<LedgerPage />)
    expect(screen.getByText('All square with Kabir')).toBeInTheDocument()
  })

  it('renders active and settled sections with the right counts', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('person=p1'))
    const person = makePerson({ id: 'p1' })
    mockUseLedgerPeople.mockReturnValue({ data: { people: [person], summary: makeSummary() }, isLoading: false, isError: false })
    mockUseLedgerEntries.mockReturnValue({
      data: {
        person,
        active: [makeEntry({ id: 'e1' })],
        settled: [makeEntry({ id: 'e2', settled: true }), makeEntry({ id: 'e3', settled: true })],
      },
      isLoading: false,
    })

    render(<LedgerPage />)
    expect(screen.getByText('ACTIVE · 1')).toBeInTheDocument()
    expect(screen.getByText('SETTLED · 2')).toBeInTheDocument()
  })

  it('the Net position KPI is hidden on desktop once a person is selected (lg:hidden)', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('person=p1'))
    const person = makePerson({ id: 'p1' })
    mockUseLedgerPeople.mockReturnValue({ data: { people: [person], summary: makeSummary() }, isLoading: false, isError: false })
    mockUseLedgerEntries.mockReturnValue({ data: { person, active: [], settled: [] }, isLoading: false })

    render(<LedgerPage />)
    // RTL doesn't evaluate media queries — assert the class contract itself.
    expect(screen.getByText('Net position').closest('div')).toHaveClass('lg:hidden')
  })
})
