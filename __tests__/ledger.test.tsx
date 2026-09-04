import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── next/navigation ────────────────────────────────────────────────────────
// The real next/navigation useRouter() returns a stable object across
// renders; a mock that returns a fresh object (and a fresh vi.fn()) on every
// call breaks any useMemo that depends on it, which previously caused an
// infinite render loop via usePageChrome. Keep this stable to match reality.
const mockPush = vi.fn()
const mockRouter = { push: mockPush, replace: vi.fn() }
const mockUseSearchParams = vi.fn(() => new URLSearchParams())
const mockRedirect = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/ledger',
  useSearchParams: () => mockUseSearchParams(),
  redirect: (url: string) => mockRedirect(url),
}))

// ─── lib/api/ledger ─────────────────────────────────────────────────────────
// updateLedgerPerson is deliberately left as the REAL implementation (not
// overridden below) — the null-vs-omitted PATCH semantics test exercises it
// directly against a spied `api.patch`, not through a mock.
vi.mock('@/lib/api/ledger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/ledger')>('@/lib/api/ledger')
  return {
    ...actual,
    getLedgerPeople: vi.fn(),
    createLedgerPerson: vi.fn(),
    getLedgerPerson: vi.fn(),
    deleteLedgerPerson: vi.fn(),
    getLedgerPersonEntries: vi.fn(),
    createLedgerEntry: vi.fn(),
    updateLedgerEntry: vi.fn(),
    deleteLedgerEntry: vi.fn(),
    settleLedgerPerson: vi.fn(),
  }
})

// ─── hooks/useLedger ────────────────────────────────────────────────────────
const mockCreatePersonMutateAsync = vi.fn()
const mockUseLedgerPeople = vi.fn()
const mockUseLedgerEntries = vi.fn()

vi.mock('@/hooks/useLedger', () => ({
  LEDGER_PEOPLE_KEY: ['ledger', 'people'],
  ledgerEntriesKey: (id: string) => ['ledger', 'people', id, 'entries'],
  useLedgerPeople: () => mockUseLedgerPeople(),
  useLedgerEntries: (id?: string) => mockUseLedgerEntries(id),
  useCreateLedgerPerson: () => ({ mutateAsync: mockCreatePersonMutateAsync, isPending: false }),
  useUpdateLedgerPerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLedgerPerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateLedgerEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateLedgerEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLedgerEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSettleLedgerPerson: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

import { PersonRow } from '@/components/ledger/PersonRow'
import { PersonForm } from '@/components/ledger/PersonForm'
import { LedgerFilterBar } from '@/components/ledger/LedgerFilterBar'
import LedgerPage from '@/app/(app)/ledger/page'
import LedgerPersonRedirect from '@/app/(app)/ledger/[personId]/page'
import { PageChromeProvider, usePageChromeValue } from '@/components/layout/PageChrome'
import { directionMeta, personSubLine, ENTRY_TYPE_META } from '@/lib/utils/ledger'
import { updateLedgerPerson } from '@/lib/api/ledger'
import { api } from '@/lib/api'
import type { LedgerPerson, LedgerSummary } from '@/lib/api/ledger'

function makePerson(overrides: Partial<LedgerPerson> = {}): LedgerPerson {
  return {
    id: 'person-1',
    name: 'Priya Nair',
    phone: null,
    note: 'Flatmate',
    color: '#6366f1',
    balance: 500,
    direction: 'OWED_TO_YOU',
    activeEntryCount: 2,
    settledEntryCount: 1,
    lastActivityAt: '2026-08-12T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
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
    settledEntries: 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseSearchParams.mockReturnValue(new URLSearchParams())
  mockUseLedgerPeople.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  mockUseLedgerEntries.mockReturnValue({ data: undefined, isLoading: false })
})

// ─── lib/utils/ledger pure helpers ─────────────────────────────────────────

describe('lib/utils/ledger', () => {
  it('directionMeta never derives from balance — it is a pure lookup on the given enum', () => {
    // Deliberately inconsistent fixture: a positive balance labelled SETTLED.
    // A recomputing implementation would show "owes you"; a lookup-table
    // implementation trusts the enum and shows "all square" regardless.
    expect(directionMeta('SETTLED').shortLabel).toBe('all square')
    expect(directionMeta('OWED_TO_YOU').shortLabel).toBe('owes you')
    expect(directionMeta('YOU_OWE').shortLabel).toBe('you owe')
  })

  it('personSubLine reports "No entries yet" when both counts are zero', () => {
    expect(
      personSubLine({ activeEntryCount: 0, settledEntryCount: 0, lastActivityAt: null, direction: 'SETTLED' }),
    ).toBe('No entries yet')
  })

  it('personSubLine says "last" for an active balance and "settled" for a zero one', () => {
    const active = personSubLine({
      activeEntryCount: 2,
      settledEntryCount: 0,
      lastActivityAt: '2026-08-12T00:00:00.000Z',
      direction: 'OWED_TO_YOU',
    })
    expect(active).toMatch(/^2 entries · last /)

    const settled = personSubLine({
      activeEntryCount: 0,
      settledEntryCount: 2,
      lastActivityAt: '2026-08-01T00:00:00.000Z',
      direction: 'SETTLED',
    })
    expect(settled).toMatch(/^2 entries · settled /)
  })

  it('ENTRY_TYPE_META gives opposite signs for GAVE and RECEIVED', () => {
    expect(ENTRY_TYPE_META.GAVE.sign).toBe('+')
    expect(ENTRY_TYPE_META.RECEIVED.sign).toBe('−')
  })
})

// ─── PersonRow — sign-convention rendering ─────────────────────────────────

describe('PersonRow', () => {
  it('renders the balance chip and direction from the server-given fields, never recomputed', () => {
    // balance is positive but direction says SETTLED — a correct component
    // renders "Settled", not a green owed-to-you chip it would show if it
    // recomputed direction from the sign of balance itself.
    const person = makePerson({ balance: 500, direction: 'SETTLED' })
    render(<PersonRow person={person} selected={false} onSelect={vi.fn()} />)

    expect(screen.getByText('Settled')).toBeInTheDocument()
    expect(screen.getByText('all square')).toBeInTheDocument()
    expect(screen.queryByText('owes you')).not.toBeInTheDocument()
  })

  it('renders an owed-to-you chip and calls onSelect with the person id', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const person = makePerson({ id: 'p-42', balance: 300, direction: 'OWED_TO_YOU' })
    render(<PersonRow person={person} selected={false} onSelect={onSelect} />)

    expect(screen.getByText('₹300.00')).toBeInTheDocument()
    await user.click(screen.getByTestId('ledger-person-row'))
    expect(onSelect).toHaveBeenCalledWith('p-42')
  })
})

// ─── lib/api/ledger — null-vs-omitted PATCH semantics ──────────────────────

describe('lib/api/ledger null-vs-omitted PATCH semantics', () => {
  it('sends phone:null when explicitly clearing, and omits it when not provided', async () => {
    const patchSpy = vi.spyOn(api, 'patch').mockReturnValue({ json: () => Promise.resolve({ person: makePerson() }) } as never)

    await updateLedgerPerson('person-1', { phone: null })
    expect(patchSpy).toHaveBeenCalledWith('api/ledger/people/person-1', { json: { phone: null } })

    patchSpy.mockClear()
    await updateLedgerPerson('person-1', { name: 'New Name' })
    const call = patchSpy.mock.calls[0]
    expect(call[1]).toEqual({ json: { name: 'New Name' } })
    expect(call[1]?.json).not.toHaveProperty('phone')
  })
})

// ─── PersonForm ─────────────────────────────────────────────────────────────

describe('PersonForm', () => {
  it('submits with phone/note omitted when left blank', async () => {
    const user = userEvent.setup()
    mockCreatePersonMutateAsync.mockResolvedValue({ person: makePerson() })
    const onClose = vi.fn()

    render(<PersonForm open onClose={onClose} />)
    await user.type(screen.getByLabelText('Name'), 'Aarav Mehta')
    await user.click(screen.getByRole('button', { name: 'Add person' }))

    await waitFor(() => {
      expect(mockCreatePersonMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Aarav Mehta', phone: undefined, note: undefined }),
      )
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('rejects an invalid phone number', async () => {
    const user = userEvent.setup()
    render(<PersonForm open onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Name'), 'Aarav Mehta')
    await user.type(screen.getByLabelText(/Phone/), 'abc')
    await user.click(screen.getByRole('button', { name: 'Add person' }))

    expect(await screen.findByText('Enter a valid phone number')).toBeInTheDocument()
    expect(mockCreatePersonMutateAsync).not.toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<PersonForm open={false} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// ─── LedgerFilterBar ────────────────────────────────────────────────────────

describe('LedgerFilterBar', () => {
  it('narrows by the selected filter and reports search text', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    const onSearchChange = vi.fn()

    render(
      <LedgerFilterBar
        filter="ALL"
        onFilterChange={onFilterChange}
        search=""
        onSearchChange={onSearchChange}
        searchInputRef={{ current: null }}
      />,
    )

    await user.click(screen.getByRole('radio', { name: 'Owes you' }))
    expect(onFilterChange).toHaveBeenCalledWith('OWED_TO_YOU')

    await user.type(screen.getByRole('searchbox', { name: 'Search people' }), 'P')
    expect(onSearchChange).toHaveBeenCalled()
  })
})

// ─── LedgerPage — list mode ─────────────────────────────────────────────────

describe('LedgerPage list mode', () => {
  it('shows loading skeletons', () => {
    mockUseLedgerPeople.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<LedgerPage />)
    expect(screen.getAllByTestId('ledger-person-row-skeleton').length).toBeGreaterThan(0)
  })

  it('shows the empty state with no "Import from contacts" affordance', () => {
    mockUseLedgerPeople.mockReturnValue({
      data: { people: [], summary: makeSummary({ personCount: 0 }) },
      isLoading: false,
      isError: false,
    })
    render(<LedgerPage />)

    expect(screen.getByText('Nobody owes anybody yet')).toBeInTheDocument()
    expect(screen.queryByText(/Import from contacts/i)).not.toBeInTheDocument()
  })

  it('renders a row per person and narrows the list by filter, without a second fetch', async () => {
    const user = userEvent.setup()
    mockUseLedgerPeople.mockReturnValue({
      data: {
        people: [
          makePerson({ id: 'p1', name: 'Priya Nair', direction: 'OWED_TO_YOU' }),
          makePerson({ id: 'p2', name: 'Rohit Desai', direction: 'SETTLED', balance: 0 }),
        ],
        summary: makeSummary({ personCount: 2 }),
      },
      isLoading: false,
      isError: false,
    })

    render(<LedgerPage />)
    expect(screen.getAllByTestId('ledger-person-row')).toHaveLength(2)

    await user.click(screen.getByRole('radio', { name: 'Settled' }))
    expect(screen.getAllByTestId('ledger-person-row')).toHaveLength(1)
    expect(screen.getByText('Rohit Desai')).toBeInTheDocument()
  })

  it('selecting a person pushes /ledger?person=<id>', async () => {
    const user = userEvent.setup()
    mockUseLedgerPeople.mockReturnValue({
      data: { people: [makePerson({ id: 'p1' })], summary: makeSummary() },
      isLoading: false,
      isError: false,
    })

    render(<LedgerPage />)
    await user.click(screen.getByTestId('ledger-person-row'))
    expect(mockPush).toHaveBeenCalledWith('/ledger?person=p1')
  })

  it('publishes onBack/title via PageChrome once a person is selected', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('person=p1'))
    mockUseLedgerPeople.mockReturnValue({
      data: { people: [makePerson({ id: 'p1', name: 'Priya Nair' })], summary: makeSummary() },
      isLoading: false,
      isError: false,
    })
    mockUseLedgerEntries.mockReturnValue({
      data: { person: makePerson({ id: 'p1', name: 'Priya Nair' }), active: [], settled: [] },
      isLoading: false,
    })

    function ChromeProbe() {
      const { title, onBack } = usePageChromeValue()
      return <span data-testid="chrome-probe">{title ?? 'none'}::{onBack ? 'has-back' : 'no-back'}</span>
    }

    render(
      <PageChromeProvider>
        <LedgerPage />
        <ChromeProbe />
      </PageChromeProvider>,
    )

    expect(screen.getByTestId('chrome-probe')).toHaveTextContent('Priya::has-back')
  })
})

// ─── [personId] redirect route ──────────────────────────────────────────────

describe('LedgerPersonRedirect', () => {
  it('awaits params and redirects to the canonical query-param URL', async () => {
    await LedgerPersonRedirect({ params: Promise.resolve({ personId: 'abc123' }) })
    expect(mockRedirect).toHaveBeenCalledWith('/ledger?person=abc123')
  })
})
