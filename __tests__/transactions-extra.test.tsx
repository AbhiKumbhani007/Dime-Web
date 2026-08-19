import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

// ─── Mocks (mirrors __tests__/transactions.test.tsx) ───────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/log',
}))

vi.mock('@/lib/api/transactions', () => ({
  listTransactions: vi.fn(),
  getTransaction: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}))

vi.mock('@/lib/api/categories', () => ({
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

vi.mock('@/hooks/useCategories', () => ({
  CATEGORIES_KEY: ['categories'],
  useCategories: vi.fn(() => ({
    data: {
      categories: [
        {
          id: 'cat-1',
          name: 'Food',
          emoji: '🍔',
          color: '#ef4444',
          isDefault: false,
          userId: 'user-1',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'cat-2',
          name: 'Transport',
          emoji: '🚗',
          color: '#3b82f6',
          isDefault: false,
          userId: 'user-1',
          createdAt: new Date().toISOString(),
        },
      ],
    },
    isLoading: false,
    error: null,
  })),
  useCreateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}))

vi.mock('@/lib/toast', () => ({
  toastAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import type { Transaction } from '@/lib/api/transactions'
import * as txApi from '@/lib/api/transactions'
import { TransactionForm } from '@/components/transactions/TransactionForm'
import { FilterBar } from '@/components/transactions/FilterBar'
import { AddTransactionFAB } from '@/components/transactions/AddTransactionFAB'
import { TransactionList } from '@/components/transactions/TransactionList'
import { SearchBar } from '@/components/transactions/SearchBar'
import {
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransactionWithUndo,
  transactionsQueryKey,
} from '@/hooks/useTransactions'
import { useTransactionFiltersStore } from '@/store/useTransactionFiltersStore'
import * as toastMod from '@/lib/toast'

const mkTx = (partial: Partial<Transaction> = {}): Transaction => ({
  id: 't-1',
  amount: 100,
  date: new Date('2026-04-18T10:00:00Z').toISOString(),
  note: 'Lunch',
  isIncome: false,
  categoryId: 'cat-1',
  userId: 'user-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...partial,
})

// Helper: build a wrapper with its own QueryClient.
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
  return { qc, Wrapper }
}

// A controllable MockIO: each instance stores its callback and observed nodes
// so tests can manually fire `entries` via `triggerIntersect`.
type IOEntryInit = { isIntersecting: boolean; target: Element }
const ioInstances: Array<{
  cb: IntersectionObserverCallback
  observed: Element[]
  trigger: (entries: IOEntryInit[]) => void
}> = []

class ControllableMockIO implements IntersectionObserver {
  root: Document | Element | null = null
  rootMargin = ''
  thresholds: readonly number[] = []
  private cb: IntersectionObserverCallback
  private observed: Element[] = []

  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
    const rec = {
      cb,
      observed: this.observed,
      trigger: (entries: IOEntryInit[]) => {
        const fullEntries = entries.map((e) => ({
          isIntersecting: e.isIntersecting,
          target: e.target,
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRatio: e.isIntersecting ? 1 : 0,
          intersectionRect: {} as DOMRectReadOnly,
          rootBounds: null,
          time: Date.now(),
        })) as unknown as IntersectionObserverEntry[]
        cb(fullEntries, this as unknown as IntersectionObserver)
      },
    }
    ioInstances.push(rec)
  }
  observe = (el: Element) => {
    this.observed.push(el)
  }
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = () => [] as IntersectionObserverEntry[]
}

;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
  ControllableMockIO

beforeEach(() => {
  vi.clearAllMocks()
  useTransactionFiltersStore.getState().reset()
  ioInstances.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

// ═══════════════════════════════════════════════════════════════════════════
//   TransactionForm
// ═══════════════════════════════════════════════════════════════════════════
describe('TransactionForm', () => {
  it('renders amount, note, date, category, and income/expense toggle fields', () => {
    const { Wrapper } = buildWrapper()
    render(
      <Wrapper>
        <TransactionForm open={true} onOpenChange={() => {}} />
      </Wrapper>
    )

    // Segmented toggle
    expect(screen.getByRole('button', { name: 'Expense' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Income' })).toBeInTheDocument()

    // Amount input (placeholder 0.00)
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()

    // Category trigger (pre-filled from first category → "Food")
    expect(screen.getByText('Food')).toBeInTheDocument()

    // Date button (has CalendarIcon + formatted date)
    // The label "Date" is rendered adjacent to the button
    expect(screen.getByText('Date')).toBeInTheDocument()

    // Note textarea (placeholder "Optional note")
    expect(screen.getByPlaceholderText('Optional note')).toBeInTheDocument()

    // Save button
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('rejects submit when amount is empty — stays open, no mutateAsync call', async () => {
    const { Wrapper } = buildWrapper()
    const onOpenChange = vi.fn()
    render(
      <Wrapper>
        <TransactionForm open={true} onOpenChange={onOpenChange} />
      </Wrapper>
    )

    // Submit with amountText still empty (parseAmount('') → 0, fails positive())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // Validation error shown
    await waitFor(() => {
      expect(
        screen.getByText(/Amount must be greater than 0/i)
      ).toBeInTheDocument()
    })

    // Form stays open, no mutation fired
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(txApi.createTransaction).not.toHaveBeenCalled()
  })

  it('rejects submit when amount is non-numeric — stays open, no mutateAsync call', async () => {
    const { Wrapper } = buildWrapper()
    const onOpenChange = vi.fn()
    render(
      <Wrapper>
        <TransactionForm open={true} onOpenChange={onOpenChange} />
      </Wrapper>
    )

    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: 'abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // parseAmount('abc') === 0 → fails positive()
    await waitFor(() => {
      expect(
        screen.getByText(/Amount must be greater than 0/i)
      ).toBeInTheDocument()
    })
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(txApi.createTransaction).not.toHaveBeenCalled()
  })

  it('allows 3+ decimal amount — schema does not constrain decimals (trust server)', async () => {
    // Per the current transactionSchema in TransactionForm.tsx, there is no
    // client-side decimal-place validation. Document the actual behavior: the
    // form submits and relies on the server to reject.
    const { Wrapper } = buildWrapper()
    vi.mocked(txApi.createTransaction).mockResolvedValue({
      transaction: mkTx(),
    })

    render(
      <Wrapper>
        <TransactionForm open={true} onOpenChange={vi.fn()} />
      </Wrapper>
    )

    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '10.555' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(txApi.createTransaction).toHaveBeenCalledTimes(1)
    })
    const [payload] = vi.mocked(txApi.createTransaction).mock.calls[0]
    expect(payload.amount).toBe(10.555)
  })

  it('allows amount > 999_999_999 — schema has no client max (trust server)', async () => {
    // Same rationale: no max constraint in transactionSchema.
    const { Wrapper } = buildWrapper()
    vi.mocked(txApi.createTransaction).mockResolvedValue({
      transaction: mkTx(),
    })

    render(
      <Wrapper>
        <TransactionForm open={true} onOpenChange={vi.fn()} />
      </Wrapper>
    )

    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '1000000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(txApi.createTransaction).toHaveBeenCalledTimes(1)
    })
    const [payload] = vi.mocked(txApi.createTransaction).mock.calls[0]
    expect(payload.amount).toBe(1_000_000_000)
  })

  it('submits a valid expense → createTransaction called with the right payload', async () => {
    const { Wrapper } = buildWrapper()
    vi.mocked(txApi.createTransaction).mockResolvedValue({
      transaction: mkTx({ id: 'new-1', amount: 125.5, note: 'Lunch out' }),
    })
    const onOpenChange = vi.fn()

    render(
      <Wrapper>
        <TransactionForm open={true} onOpenChange={onOpenChange} />
      </Wrapper>
    )

    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '125.50' },
    })
    fireEvent.change(screen.getByPlaceholderText('Optional note'), {
      target: { value: 'Lunch out' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(txApi.createTransaction).toHaveBeenCalledTimes(1)
    })
    const [payload] = vi.mocked(txApi.createTransaction).mock.calls[0]
    expect(payload).toMatchObject({
      amount: 125.5,
      note: 'Lunch out',
      isIncome: false,
      categoryId: 'cat-1',
    })
    expect(typeof payload.date).toBe('string')
    // Form closes on success
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('in edit mode with a pre-filled transaction → shows existing values, submit calls updateTransaction', async () => {
    const { Wrapper } = buildWrapper()
    const existing = mkTx({
      id: 'edit-1',
      amount: 250,
      note: 'Existing lunch',
      isIncome: false,
      categoryId: 'cat-1',
    })
    vi.mocked(txApi.updateTransaction).mockResolvedValue({
      transaction: existing,
    })
    const onOpenChange = vi.fn()

    render(
      <Wrapper>
        <TransactionForm
          open={true}
          onOpenChange={onOpenChange}
          transaction={existing}
        />
      </Wrapper>
    )

    // Title swaps to "Edit Transaction"
    expect(screen.getByText('Edit Transaction')).toBeInTheDocument()
    // Amount pre-filled
    expect(screen.getByDisplayValue('250')).toBeInTheDocument()
    // Note pre-filled
    expect(screen.getByDisplayValue('Existing lunch')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(txApi.updateTransaction).toHaveBeenCalledTimes(1)
    })
    const [id, patch] = vi.mocked(txApi.updateTransaction).mock.calls[0]
    expect(id).toBe('edit-1')
    expect(patch).toMatchObject({
      amount: 250,
      note: 'Existing lunch',
      isIncome: false,
      categoryId: 'cat-1',
    })
    // createTransaction must NOT fire
    expect(txApi.createTransaction).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//   FilterBar
// ═══════════════════════════════════════════════════════════════════════════
describe('FilterBar', () => {
  it('shows a chip for each category from useCategories', () => {
    render(<FilterBar />)
    expect(screen.getByRole('button', { name: /Food/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Transport/ })).toBeInTheDocument()
  })

  it('tapping a category chip sets filters.categoryId; tapping again clears it (toggle)', () => {
    render(<FilterBar />)

    expect(useTransactionFiltersStore.getState().categoryId).toBeNull()

    const foodChip = screen.getByRole('button', { name: /Food/ })
    fireEvent.click(foodChip)
    expect(useTransactionFiltersStore.getState().categoryId).toBe('cat-1')

    fireEvent.click(foodChip)
    expect(useTransactionFiltersStore.getState().categoryId).toBeNull()
  })

  it('income/expense segmented toggle writes filters.isIncome (undefined/null | true | false)', () => {
    render(<FilterBar />)

    expect(useTransactionFiltersStore.getState().isIncome).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expense' }))
    expect(useTransactionFiltersStore.getState().isIncome).toBe(false)

    // Clicking Expense again clears (toggles back to null)
    fireEvent.click(screen.getByRole('button', { name: 'Expense' }))
    expect(useTransactionFiltersStore.getState().isIncome).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Income' }))
    expect(useTransactionFiltersStore.getState().isIncome).toBe(true)
  })

  it('renders "Date range" (no-active-filters label) when no filters active', () => {
    render(<FilterBar />)
    // When `from` and `to` are both null, the default label is "Date range"
    expect(screen.getByText('Date range')).toBeInTheDocument()
    // Clear-button (X) must NOT be present
    expect(
      screen.queryByRole('button', { name: 'Clear date range' })
    ).not.toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//   AddTransactionFAB
// ═══════════════════════════════════════════════════════════════════════════
describe('AddTransactionFAB', () => {
  it('renders a visible button by default', () => {
    render(<AddTransactionFAB onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Add transaction' })).toBeInTheDocument()
  })

  it('fires onClick when clicked', () => {
    const onClick = vi.fn()
    render(<AddTransactionFAB onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  // NOTE: Scroll-based hide/show is skipped intentionally.
  // AddTransactionFAB depends on framer-motion's `useScroll` + `useMotionValueEvent`,
  // which observes window scroll via requestAnimationFrame, and on a `<main>`
  // element's scrollTop. In jsdom, neither `scrollY` nor `scrollTop` genuinely
  // changes on synthetic `scroll` events (layout is not computed), and
  // useMotionValueEvent callbacks do not reliably fire. Rather than testing
  // internal framer-motion state, we document the behavior here and rely on
  // e2e/visual tests for this interaction.
})

// ═══════════════════════════════════════════════════════════════════════════
//   Infinite scroll (TransactionList)
// ═══════════════════════════════════════════════════════════════════════════
describe('TransactionList infinite scroll', () => {
  it('calls fetchNextPage when the sentinel becomes visible', async () => {
    const { Wrapper } = buildWrapper()
    // First page returns a non-null nextCursor so hasNextPage === true
    vi.mocked(txApi.listTransactions).mockImplementation(async (params) => {
      if (!params?.cursor) {
        return {
          items: [mkTx({ id: 'p1-a', note: 'Page1 A' })],
          nextCursor: 'cursor-2',
        }
      }
      return { items: [mkTx({ id: 'p2-a', note: 'Page2 A' })], nextCursor: null }
    })

    render(
      <Wrapper>
        <TransactionList />
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByText('Page1 A')).toBeInTheDocument()
    })

    // The last-registered IO is the list sentinel.
    // (Our mock records every constructed IO across this render.)
    const io = ioInstances[ioInstances.length - 1]
    expect(io).toBeTruthy()
    expect(io.observed.length).toBe(1)
    const sentinel = io.observed[0]

    act(() => {
      io.trigger([{ isIntersecting: true, target: sentinel }])
    })

    await waitFor(() => {
      expect(screen.getByText('Page2 A')).toBeInTheDocument()
    })

    // listTransactions called at least twice: first with no cursor, then with 'cursor-2'
    const calls = vi.mocked(txApi.listTransactions).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(calls.some((c) => c[0]?.cursor === 'cursor-2')).toBe(true)
  })

  it('does NOT trigger fetchNextPage when hasNextPage is false', async () => {
    const { Wrapper } = buildWrapper()
    vi.mocked(txApi.listTransactions).mockResolvedValue({
      items: [mkTx({ id: 'only', note: 'Only page' })],
      nextCursor: null, // => hasNextPage === false, so IO isn't even created
    })

    render(
      <Wrapper>
        <TransactionList />
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByText('Only page')).toBeInTheDocument()
    })

    // With hasNextPage=false, the IO effect bails early (no observer created).
    // Even if some IO exists, triggering it must not produce a second cursor call.
    for (const io of ioInstances) {
      if (io.observed.length > 0) {
        act(() => {
          io.trigger(
            io.observed.map((t) => ({ isIntersecting: true, target: t }))
          )
        })
      }
    }

    // Give any queued microtask a chance to run
    await new Promise((r) => setTimeout(r, 20))

    const calls = vi.mocked(txApi.listTransactions).mock.calls
    // Only the initial call should have been made; no "next cursor" call
    expect(calls.every((c) => !c[0]?.cursor)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//   Hook edge cases
// ═══════════════════════════════════════════════════════════════════════════
describe('useCreateTransaction — error rollback', () => {
  it('rolls back cache and calls toastError on mutation error', async () => {
    const { qc, Wrapper } = buildWrapper()
    const key = transactionsQueryKey({})
    const existing = mkTx({ id: 'existing', note: 'Existing' })
    const initial = {
      pageParams: [undefined],
      pages: [{ items: [existing], nextCursor: null }],
    }
    qc.setQueryData(key, initial)

    vi.mocked(txApi.createTransaction).mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useCreateTransaction({}), {
      wrapper: Wrapper,
    })

    await act(async () => {
      try {
        await result.current.mutateAsync({
          amount: 50,
          date: new Date().toISOString(),
          note: 'Will fail',
          isIncome: false,
          categoryId: 'cat-1',
        })
      } catch {
        /* expected */
      }
    })

    // Cache restored to just the single "existing" row
    const after = qc.getQueryData(key) as {
      pages: Array<{ items: Transaction[] }>
    }
    expect(after.pages[0].items.length).toBe(1)
    expect(after.pages[0].items[0].id).toBe('existing')

    expect(toastMod.toastError).toHaveBeenCalledWith(
      'Could not add transaction'
    )
  })
})

describe('useUpdateTransaction', () => {
  it('optimistic patch visible in cache immediately; rolls back on error', async () => {
    const { qc, Wrapper } = buildWrapper()
    const key = transactionsQueryKey({})
    const original = mkTx({ id: 'u-1', note: 'Original', amount: 100 })
    qc.setQueryData(key, {
      pageParams: [undefined],
      pages: [{ items: [original], nextCursor: null }],
    })

    // Never-resolving so we can observe optimistic state before settlement
    let reject: (err: Error) => void = () => {}
    vi.mocked(txApi.updateTransaction).mockImplementation(
      () =>
        new Promise((_res, rej) => {
          reject = rej
        })
    )

    const { result } = renderHook(() => useUpdateTransaction({}), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.mutate({
        id: 'u-1',
        patch: { note: 'Patched', amount: 200 },
      })
    })

    // Optimistic patch visible right away
    await waitFor(() => {
      const cache = qc.getQueryData(key) as {
        pages: Array<{ items: Transaction[] }>
      }
      expect(cache.pages[0].items[0].note).toBe('Patched')
      expect(cache.pages[0].items[0].amount).toBe(200)
    })

    // Now reject → rollback
    await act(async () => {
      reject(new Error('server-down'))
      await Promise.resolve()
    })

    await waitFor(() => {
      const cache = qc.getQueryData(key) as {
        pages: Array<{ items: Transaction[] }>
      }
      expect(cache.pages[0].items[0].note).toBe('Original')
      expect(cache.pages[0].items[0].amount).toBe(100)
    })

    expect(toastMod.toastError).toHaveBeenCalledWith(
      'Could not update transaction'
    )
  })
})

describe('useDeleteTransactionWithUndo — backend DELETE rejects', () => {
  it('after the 5s timer fires, if DELETE rejects, cache rolls back and toastError is called', async () => {
    vi.useFakeTimers()
    const { qc, Wrapper } = buildWrapper()
    const key = transactionsQueryKey({})
    const tx = mkTx({ id: 'del-reject' })
    qc.setQueryData(key, {
      pageParams: [undefined],
      pages: [{ items: [tx], nextCursor: null }],
    })

    vi.mocked(txApi.deleteTransaction).mockRejectedValue(new Error('server-500'))

    const { result } = renderHook(() => useDeleteTransactionWithUndo({}), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current(tx)
    })

    // Item optimistically removed
    expect(
      (qc.getQueryData(key) as { pages: Array<{ items: Transaction[] }> }).pages[0]
        .items.length
    ).toBe(0)

    // Advance past the 5s timer → deleteTransaction invoked (rejects)
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(txApi.deleteTransaction).toHaveBeenCalledWith('del-reject')

    // Now drain the rejected-promise microtask queue. waitFor uses real
    // timers, so we switch back before using it.
    vi.useRealTimers()
    await waitFor(() => {
      const cache = qc.getQueryData(key) as {
        pages: Array<{ items: Transaction[] }>
      }
      expect(cache.pages[0].items.length).toBe(1)
      expect(cache.pages[0].items[0].id).toBe('del-reject')
    })

    expect(toastMod.toastError).toHaveBeenCalledWith(
      'Could not delete transaction'
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//   SearchBar — extra: type fast then clear → store reflects empty after debounce
// ═══════════════════════════════════════════════════════════════════════════
describe('SearchBar — type fast then clear', () => {
  it('after debounce, store reflects the final (empty) value, not the intermediate', async () => {
    vi.useFakeTimers()
    render(<SearchBar />)

    const input = screen.getByRole('searchbox', { name: /search transactions/i })

    // Type three intermediate values quickly
    fireEvent.change(input, { target: { value: 'c' } })
    fireEvent.change(input, { target: { value: 'co' } })
    fireEvent.change(input, { target: { value: 'coffee' } })

    // Before the debounce elapses, the store is still empty
    expect(useTransactionFiltersStore.getState().search).toBe('')

    // Then clear back to empty, still within the debounce window
    fireEvent.change(input, { target: { value: '' } })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    // After the debounce, the final empty value is committed to the store
    expect(useTransactionFiltersStore.getState().search).toBe('')
  })
})
