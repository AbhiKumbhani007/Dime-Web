import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/budgets',
}))

// Mock the budgets API module
vi.mock('@/lib/api/budgets', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/budgets')>('@/lib/api/budgets')
  return {
    ...actual,
    getBudgets: vi.fn(),
    getBudgetProgress: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
    deleteBudget: vi.fn(),
  }
})

// Mock the budgets hooks
const mockCreateMutateAsync = vi.fn()
const mockUpdateMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()
const mockUseBudgets = vi.fn()

vi.mock('@/hooks/useBudgets', () => ({
  BUDGETS_KEY: ['budgets'],
  useBudgets: () => mockUseBudgets(),
  useCreateBudget: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUpdateBudget: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteBudget: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
}))

vi.mock('@/hooks/useCategories', () => ({
  CATEGORIES_KEY: ['categories'],
  useCategories: () => ({
    data: {
      categories: [
        {
          id: 'cat-1',
          name: 'Food',
          emoji: '🍔',
          color: '#ef4444',
          isDefault: true,
          userId: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
}))

// Mock @tanstack/react-query so no QueryClientProvider is needed
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

import { BudgetCard } from '@/components/budgets/BudgetCard'
import { BudgetForm } from '@/components/budgets/BudgetForm'
import { BudgetDonutSummary } from '@/components/budgets/BudgetDonutSummary'
import { DeleteBudgetDialog } from '@/components/budgets/DeleteBudgetDialog'
import BudgetsPage from '@/app/(app)/budgets/page'
import { budgetHealth, clampPercent } from '@/lib/utils/budgetProgress'
import type { BudgetWithProgress } from '@/lib/api/budgets'

function makeBudget(overrides: Partial<BudgetWithProgress> = {}): BudgetWithProgress {
  return {
    id: 'budget-1',
    name: 'Groceries',
    emoji: '🛒',
    colour: '#6366f1',
    type: 'MONTHLY',
    amount: 10000,
    startDate: '2026-04-01T00:00:00.000Z',
    userId: 'user-1',
    categoryId: 'cat-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    category: {
      id: 'cat-1',
      name: 'Food',
      emoji: '🍔',
      color: '#ef4444',
      isDefault: true,
      userId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    spent: 2500,
    remaining: 7500,
    percent: 25,
    daysRemaining: 12,
    periodStart: '2026-04-01T00:00:00.000Z',
    periodEnd: '2026-04-30T23:59:59.999Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseBudgets.mockReturnValue({
    data: { budgets: [makeBudget()] },
    isLoading: false,
    isError: false,
  })
})

// ─── Health thresholds ────────────────────────────────────────────────────────

describe('budgetHealth thresholds', () => {
  it('is safe below 75%', () => {
    expect(budgetHealth(0)).toBe('safe')
    expect(budgetHealth(74.99)).toBe('safe')
  })

  it('flips to warning at exactly 75%', () => {
    expect(budgetHealth(75)).toBe('warning')
    expect(budgetHealth(90)).toBe('warning')
  })

  it('flips to danger above 90%', () => {
    expect(budgetHealth(90.01)).toBe('danger')
    expect(budgetHealth(150)).toBe('danger')
  })
})

describe('clampPercent', () => {
  it('clamps overspend to 100 for the bar width', () => {
    expect(clampPercent(150)).toBe(100)
  })

  it('floors negative or non-finite input at 0', () => {
    expect(clampPercent(-5)).toBe(0)
    expect(clampPercent(NaN)).toBe(0)
  })

  it('passes normal values through', () => {
    expect(clampPercent(42.5)).toBe(42.5)
  })
})

// ─── BudgetCard ───────────────────────────────────────────────────────────────

describe('BudgetCard', () => {
  const noop = () => {}

  it('renders name, emoji, category chip and period badge', () => {
    render(<BudgetCard budget={makeBudget()} onEdit={noop} onDelete={noop} />)

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('🛒')).toBeInTheDocument()
    expect(screen.getByText(/Food/)).toBeInTheDocument()
    expect(screen.getByText('Monthly')).toBeInTheDocument()
  })

  it('shows spent and limit amounts', () => {
    render(<BudgetCard budget={makeBudget()} onEdit={noop} onDelete={noop} />)

    expect(screen.getByText(/2,500/)).toBeInTheDocument()
    expect(screen.getByText(/10,000/)).toBeInTheDocument()
  })

  it('uses the green bar below 75%', () => {
    render(<BudgetCard budget={makeBudget({ percent: 25 })} onEdit={noop} onDelete={noop} />)
    expect(screen.getByTestId('budget-progress-bar').className).toContain('bg-green-500')
  })

  it('uses the amber bar at 75%', () => {
    render(<BudgetCard budget={makeBudget({ percent: 75 })} onEdit={noop} onDelete={noop} />)
    expect(screen.getByTestId('budget-progress-bar').className).toContain('bg-amber-500')
  })

  it('uses the amber bar at 90%', () => {
    render(<BudgetCard budget={makeBudget({ percent: 90 })} onEdit={noop} onDelete={noop} />)
    expect(screen.getByTestId('budget-progress-bar').className).toContain('bg-amber-500')
  })

  it('uses the red bar above 90%', () => {
    render(<BudgetCard budget={makeBudget({ percent: 91 })} onEdit={noop} onDelete={noop} />)
    expect(screen.getByTestId('budget-progress-bar').className).toContain('bg-red-500')
  })

  it('caps the bar width at 100% when overspent', () => {
    render(
      <BudgetCard
        budget={makeBudget({ percent: 150, spent: 15000, remaining: -5000 })}
        onEdit={noop}
        onDelete={noop}
      />
    )

    expect(screen.getByTestId('budget-progress-bar')).toHaveStyle({ width: '100%' })
  })

  it('shows an over-by line when the budget is exceeded', () => {
    render(
      <BudgetCard
        budget={makeBudget({ percent: 150, spent: 15000, remaining: -5000 })}
        onEdit={noop}
        onDelete={noop}
      />
    )

    expect(screen.getByText(/Over by/)).toBeInTheDocument()
  })

  it('does not show the over-by line when within budget', () => {
    render(<BudgetCard budget={makeBudget()} onEdit={noop} onDelete={noop} />)
    expect(screen.queryByText(/Over by/)).not.toBeInTheDocument()
  })

  it('pluralises days remaining correctly', () => {
    const { rerender } = render(
      <BudgetCard budget={makeBudget({ daysRemaining: 1 })} onEdit={noop} onDelete={noop} />
    )
    expect(screen.getByText('1 day left')).toBeInTheDocument()

    rerender(<BudgetCard budget={makeBudget({ daysRemaining: 5 })} onEdit={noop} onDelete={noop} />)
    expect(screen.getByText('5 days left')).toBeInTheDocument()
  })

  it('exposes the progress bar to assistive tech', () => {
    render(<BudgetCard budget={makeBudget({ percent: 25 })} onEdit={noop} onDelete={noop} />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('opens the menu and fires onEdit', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()
    render(<BudgetCard budget={makeBudget()} onEdit={onEdit} onDelete={noop} />)

    await user.click(screen.getByRole('button', { name: /Options for Groceries/ }))
    await user.click(await screen.findByText('Edit'))

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'budget-1' }))
  })

  it('opens the menu and fires onDelete', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<BudgetCard budget={makeBudget()} onEdit={noop} onDelete={onDelete} />)

    await user.click(screen.getByRole('button', { name: /Options for Groceries/ }))
    await user.click(await screen.findByText('Delete'))

    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'budget-1' }))
  })

  it('opens the menu after a 500ms long-press', () => {
    vi.useFakeTimers()
    try {
      render(<BudgetCard budget={makeBudget()} onEdit={noop} onDelete={noop} />)

      fireEvent.pointerDown(screen.getByTestId('budget-card'))
      act(() => {
        vi.advanceTimersByTime(600)
      })

      // Radix hides the trigger from the a11y tree while the menu is open, so
      // assert on the menu itself rather than the trigger's aria-expanded.
      expect(screen.getByRole('menu')).toBeInTheDocument()
      expect(screen.getByText('Edit')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not open the menu when the press is released early', () => {
    vi.useFakeTimers()
    try {
      render(<BudgetCard budget={makeBudget()} onEdit={noop} onDelete={noop} />)

      const card = screen.getByTestId('budget-card')
      fireEvent.pointerDown(card)
      act(() => {
        vi.advanceTimersByTime(200)
      })
      fireEvent.pointerUp(card)
      act(() => {
        vi.advanceTimersByTime(600)
      })

      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ─── Donut summary ────────────────────────────────────────────────────────────

describe('BudgetDonutSummary', () => {
  it('aggregates spend across every budget', () => {
    render(
      <BudgetDonutSummary
        budgets={[
          makeBudget({ id: 'b1', amount: 10000, spent: 2500 }),
          makeBudget({ id: 'b2', amount: 10000, spent: 7500 }),
        ]}
      />
    )

    // 10,000 spent of 20,000 budgeted → 50%
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText(/20,000/)).toBeInTheDocument()
  })

  it('renders 0% rather than NaN when every budget is zero', () => {
    render(<BudgetDonutSummary budgets={[makeBudget({ amount: 0, spent: 0 })]} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})

// ─── BudgetForm ───────────────────────────────────────────────────────────────

describe('BudgetForm', () => {
  it('renders the create title when no budget is passed', () => {
    render(<BudgetForm open onOpenChange={() => {}} />)
    expect(screen.getByText('New Budget')).toBeInTheDocument()
  })

  it('renders the edit title and pre-fills the name', () => {
    render(<BudgetForm open onOpenChange={() => {}} budget={makeBudget()} />)

    expect(screen.getByText('Edit Budget')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Groceries')
  })

  it('associates every text label with its input', () => {
    render(<BudgetForm open onOpenChange={() => {}} />)

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Limit')).toBeInTheDocument()
  })

  it('marks the selected period with aria-checked', async () => {
    const user = userEvent.setup()
    render(<BudgetForm open onOpenChange={() => {}} />)

    // MONTHLY is the default
    expect(screen.getByRole('radio', { name: 'Monthly' })).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('radio', { name: 'Weekly' }))
    expect(screen.getByRole('radio', { name: 'Weekly' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Monthly' })).toHaveAttribute('aria-checked', 'false')
  })

  it('blocks submission when no category is chosen', async () => {
    const user = userEvent.setup()
    render(<BudgetForm open onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText('Name'), 'Coffee')
    await user.type(screen.getByLabelText('Limit'), '500')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Category is required')).toBeInTheDocument()
    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
  })

  it('rejects a zero or negative limit', async () => {
    const user = userEvent.setup()
    render(<BudgetForm open onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText('Name'), 'Coffee')
    await user.type(screen.getByLabelText('Limit'), '-10')
    await user.click(screen.getByRole('radio', { name: /Food/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Amount must be greater than 0')).toBeInTheDocument()
    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
  })

  it('rejects more than 2 decimal places without a server round trip', async () => {
    const user = userEvent.setup()
    render(<BudgetForm open onOpenChange={() => {}} />)

    await user.type(screen.getByLabelText('Name'), 'Coffee')
    await user.type(screen.getByLabelText('Limit'), '10.555')
    await user.click(screen.getByRole('radio', { name: /Food/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('Amount can have at most 2 decimal places')
    ).toBeInTheDocument()
    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
  })

  it('submits a valid new budget', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mockCreateMutateAsync.mockResolvedValue({ budget: makeBudget() })

    render(<BudgetForm open onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText('Name'), 'Coffee')
    await user.type(screen.getByLabelText('Limit'), '500')
    await user.click(screen.getByRole('radio', { name: /Food/ }))
    await user.click(screen.getByRole('radio', { name: 'Weekly' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Coffee',
          amount: 500,
          type: 'WEEKLY',
          categoryId: 'cat-1',
        })
      )
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls update rather than create when editing', async () => {
    const user = userEvent.setup()
    mockUpdateMutateAsync.mockResolvedValue({ budget: makeBudget() })

    render(<BudgetForm open onOpenChange={() => {}} budget={makeBudget()} />)

    await user.clear(screen.getByLabelText('Limit'))
    await user.type(screen.getByLabelText('Limit'), '20000')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'budget-1',
          data: expect.objectContaining({ amount: 20000 }),
        })
      )
    })
    expect(mockCreateMutateAsync).not.toHaveBeenCalled()
  })

  it('surfaces a server failure inline instead of closing', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mockCreateMutateAsync.mockRejectedValue(new Error('boom'))

    render(<BudgetForm open onOpenChange={onOpenChange} />)

    await user.type(screen.getByLabelText('Name'), 'Coffee')
    await user.type(screen.getByLabelText('Limit'), '500')
    await user.click(screen.getByRole('radio', { name: /Food/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})

// ─── Delete dialog ────────────────────────────────────────────────────────────

describe('DeleteBudgetDialog', () => {
  it('deletes on confirm and shows a success toast', async () => {
    const user = userEvent.setup()
    mockDeleteMutateAsync.mockResolvedValue(undefined)
    const onOpenChange = vi.fn()

    render(<DeleteBudgetDialog budget={makeBudget()} open onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockDeleteMutateAsync).toHaveBeenCalledWith('budget-1'))
    expect(mockToastSuccess).toHaveBeenCalledWith('Budget deleted')
  })

  it('shows an error toast when the delete fails', async () => {
    const user = userEvent.setup()
    mockDeleteMutateAsync.mockRejectedValue(new Error('nope'))

    render(<DeleteBudgetDialog budget={makeBudget()} open onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
  })
})

// ─── Page ─────────────────────────────────────────────────────────────────────

describe('BudgetsPage', () => {
  it('renders skeletons while loading', () => {
    mockUseBudgets.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<BudgetsPage />)

    expect(screen.getAllByTestId('budget-card-skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('budget-card')).not.toBeInTheDocument()
  })

  it('renders the empty state when there are no budgets', () => {
    mockUseBudgets.mockReturnValue({ data: { budgets: [] }, isLoading: false, isError: false })
    render(<BudgetsPage />)

    expect(screen.getByText('No budgets yet')).toBeInTheDocument()
    expect(screen.queryByTestId('budget-donut-summary')).not.toBeInTheDocument()
  })

  it('renders the donut summary and one card per budget', () => {
    mockUseBudgets.mockReturnValue({
      data: { budgets: [makeBudget({ id: 'b1' }), makeBudget({ id: 'b2' })] },
      isLoading: false,
      isError: false,
    })
    render(<BudgetsPage />)

    expect(screen.getByTestId('budget-donut-summary')).toBeInTheDocument()
    expect(screen.getAllByTestId('budget-card')).toHaveLength(2)
  })

  it('renders an error message when the query fails', () => {
    mockUseBudgets.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<BudgetsPage />)

    expect(screen.getByText(/Could not load budgets/)).toBeInTheDocument()
  })

  it('opens the form from the FAB', async () => {
    const user = userEvent.setup()
    render(<BudgetsPage />)

    await user.click(screen.getByRole('button', { name: 'Add budget' }))

    expect(await screen.findByText('New Budget')).toBeInTheDocument()
  })
})
