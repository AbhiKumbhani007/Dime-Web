import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── hooks/useLedger ────────────────────────────────────────────────────────
const mockCreatePersonMutateAsync = vi.fn()
const mockUpdatePersonMutateAsync = vi.fn()
const mockDeletePersonMutateAsync = vi.fn()

vi.mock('@/hooks/useLedger', () => ({
  useCreateLedgerPerson: () => ({ mutateAsync: mockCreatePersonMutateAsync, isPending: false }),
  useUpdateLedgerPerson: () => ({ mutateAsync: mockUpdatePersonMutateAsync, isPending: false }),
  useDeleteLedgerPerson: () => ({ mutateAsync: mockDeletePersonMutateAsync, isPending: false }),
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('@/lib/toast', () => ({
  toastSuccess: (m: string) => mockToastSuccess(m),
  toastError: (m: string) => mockToastError(m),
  toastAction: vi.fn(),
}))

import { PersonDetailHeader } from '@/components/ledger/PersonDetailHeader'
import { PersonForm } from '@/components/ledger/PersonForm'
import { DeletePersonDialog } from '@/components/ledger/DeletePersonDialog'
import type { LedgerPerson } from '@/lib/api/ledger'

function makePerson(overrides: Partial<LedgerPerson> = {}): LedgerPerson {
  return {
    id: 'person-1',
    name: 'Priya Nair',
    phone: null,
    note: 'Flatmate',
    color: '#6366f1',
    balance: 1250,
    direction: 'OWED_TO_YOU',
    activeEntryCount: 3,
    settledEntryCount: 1,
    lastActivityAt: '2026-08-12T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── PersonDetailHeader — overflow menu ─────────────────────────────────────

describe('PersonDetailHeader overflow menu', () => {
  it('renders Edit person / Delete person and calls the callbacks when clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(
      <PersonDetailHeader
        person={makePerson()}
        onAddEntry={vi.fn()}
        onSettle={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Person options' }))
    expect(await screen.findByText('Edit person')).toBeInTheDocument()
    expect(screen.getByText('Delete person')).toBeInTheDocument()

    await user.click(screen.getByText('Edit person'))
    expect(onEdit).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Person options' }))
    await user.click(await screen.findByText('Delete person'))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})

// ─── PersonForm — edit mode ──────────────────────────────────────────────────

describe('PersonForm edit mode', () => {
  it('prefills from the person prop and calls update, not create, on submit', async () => {
    const user = userEvent.setup()
    const person = makePerson({ id: 'p-9', name: 'Rohit Desai', phone: '+919876543210', note: 'Colleague' })
    mockUpdatePersonMutateAsync.mockResolvedValue({ person })
    const onClose = vi.fn()

    render(<PersonForm open person={person} onClose={onClose} />)

    expect(screen.getByText('Edit person')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Rohit Desai')).toBeInTheDocument()
    expect(screen.getByDisplayValue('+919876543210')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Colleague')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockUpdatePersonMutateAsync).toHaveBeenCalledWith({
        id: 'p-9',
        data: expect.objectContaining({ name: 'Rohit Desai', phone: '+919876543210', note: 'Colleague' }),
      })
    })
    expect(mockCreatePersonMutateAsync).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('sends null (not omitted) for an optional field the user clears', async () => {
    const user = userEvent.setup()
    const person = makePerson({ id: 'p-9', note: 'Colleague' })
    mockUpdatePersonMutateAsync.mockResolvedValue({ person })

    render(<PersonForm open person={person} onClose={vi.fn()} />)

    const noteInput = screen.getByLabelText(/Note/)
    await user.clear(noteInput)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockUpdatePersonMutateAsync).toHaveBeenCalledWith({
        id: 'p-9',
        data: expect.objectContaining({ note: null }),
      })
    })
  })
})

// ─── DeletePersonDialog ──────────────────────────────────────────────────────

describe('DeletePersonDialog', () => {
  it('shows the outstanding balance and entry count, and calls the delete mutation', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onDeleted = vi.fn()
    const person = makePerson({ id: 'p-7', name: 'Priya', balance: 1250, activeEntryCount: 3, settledEntryCount: 1 })
    mockDeletePersonMutateAsync.mockResolvedValue(undefined)

    render(<DeletePersonDialog person={person} open onOpenChange={onOpenChange} onDeleted={onDeleted} />)

    expect(
      screen.getByText(
        'Deleting Priya will also delete 4 entries and an outstanding balance of ₹1,250.00 will be written off — this cannot be undone.',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete person' }))

    await waitFor(() => expect(mockDeletePersonMutateAsync).toHaveBeenCalledWith('p-7'))
    expect(mockToastSuccess).toHaveBeenCalledWith('Person deleted')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onDeleted).toHaveBeenCalled()
  })

  it('omits the balance clause for an already-settled person', () => {
    const person = makePerson({ name: 'Kabir', balance: 0, direction: 'SETTLED', activeEntryCount: 0, settledEntryCount: 2 })
    render(<DeletePersonDialog person={person} open onOpenChange={vi.fn()} />)

    expect(
      screen.getByText('Deleting Kabir will also delete 2 entries — this cannot be undone.'),
    ).toBeInTheDocument()
  })

  it('toasts an error and keeps the dialog open when the delete request fails', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onDeleted = vi.fn()
    mockDeletePersonMutateAsync.mockRejectedValue(new Error('boom'))

    render(<DeletePersonDialog person={makePerson()} open onOpenChange={onOpenChange} onDeleted={onDeleted} />)
    await user.click(screen.getByRole('button', { name: 'Delete person' }))

    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
