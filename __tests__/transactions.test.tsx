import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/log',
}))

// Mock the transactions API so no real network
vi.mock('@/lib/api/transactions', () => ({
  listTransactions: vi.fn(),
  getTransaction: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}))

// Mock categories API
vi.mock('@/lib/api/categories', () => ({
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

// Mock useCategories to feed deterministic data to components
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
      ],
    },
    isLoading: false,
    error: null,
  })),
  useCreateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteCategory: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}))

// Mock toast module
vi.mock('@/lib/toast', () => ({
  toastAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

// IMPORTANT: We do NOT mock @tanstack/react-query here — tests that render
// components use real QueryClient, and tests that exercise hooks wrap with a
// real QueryClientProvider. Components that internally call `useTransactions`
// etc. will hit the real hooks which hit the mocked lib/api/transactions.

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import type { Transaction } from '@/lib/api/transactions'
import * as txApi from '@/lib/api/transactions'
import { TransactionList } from '@/components/transactions/TransactionList'
import { TransactionItem } from '@/components/transactions/TransactionItem'
import { SearchBar } from '@/components/transactions/SearchBar'
import { TransactionItemSkeleton } from '@/components/transactions/TransactionItemSkeleton'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  useCreateTransaction,
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

// Helper to build a QueryClient + provider wrapper.
// gcTime: Infinity — renderHook tests have no observer, so gcTime:0 would collect
// the query between setQueryData and the mutation's internal writes.
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

// Silence IntersectionObserver
class MockIO {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
  takeRecords = vi.fn(() => [])
  root = null
  rootMargin = ''
  thresholds: number[] = []
}
;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockIO

beforeEach(() => {
  vi.clearAllMocks()
  useTransactionFiltersStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── 1. TransactionItemSkeleton renders ─────────────────────────────────────
describe('TransactionItemSkeleton', () => {
  it('renders a skeleton row', () => {
    render(<TransactionItemSkeleton />)
    expect(screen.getByTestId('transaction-skeleton')).toBeInTheDocument()
  })
})

// ─── 2. TransactionList renders and groups by date ─────────────────────────
describe('TransactionList', () => {
  it('renders transactions with emoji, note, and amount', async () => {
    const { Wrapper } = buildWrapper()
    const tx = mkTx({ id: 't-1', note: 'Pizza', amount: 240 })
    vi.mocked(txApi.listTransactions).mockResolvedValue({
      items: [tx],
      nextCursor: null,
    })

    render(
      <Wrapper>
        <TransactionList />
      </Wrapper>
    )

    // Initial: skeleton
    expect(screen.getByTestId('transaction-list-loading')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeInTheDocument()
    })
    expect(screen.getAllByText('🍔').length).toBeGreaterThan(0)
    expect(screen.getByText(/240/)).toBeInTheDocument()
  })

  // ─── Empty state ────────────────────────────────────────────────────────
  it('shows empty state when no transactions', async () => {
    const { Wrapper } = buildWrapper()
    vi.mocked(txApi.listTransactions).mockResolvedValue({
      items: [],
      nextCursor: null,
    })

    render(
      <Wrapper>
        <TransactionList />
      </Wrapper>
    )

    await waitFor(() => {
      expect(screen.getByTestId('transaction-list-empty')).toBeInTheDocument()
    })
    expect(screen.getByText(/No transactions/)).toBeInTheDocument()
  })

  // ─── Skeleton on first load ─────────────────────────────────────────────
  it('shows 8 skeleton rows while initial load is pending', () => {
    const { Wrapper } = buildWrapper()
    // Never-resolving promise keeps the query pending forever
    vi.mocked(txApi.listTransactions).mockImplementation(
      () => new Promise(() => {})
    )

    render(
      <Wrapper>
        <TransactionList />
      </Wrapper>
    )

    expect(screen.getByTestId('transaction-list-loading')).toBeInTheDocument()
    expect(screen.getAllByTestId('transaction-skeleton').length).toBe(8)
  })
})

// ─── 3. useDebouncedValue ──────────────────────────────────────────────────
describe('useDebouncedValue', () => {
  it('delays value updates by the given delay', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } }
    )
    expect(result.current).toBe('a')

    rerender({ value: 'ab' })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('ab')
  })
})

// ─── 4. SearchBar writes to filter store after 300ms ───────────────────────
describe('SearchBar', () => {
  it('updates the filter store after a 300ms debounce', async () => {
    vi.useFakeTimers()
    render(<SearchBar />)

    const input = screen.getByRole('searchbox', { name: /search transactions/i })
    fireEvent.change(input, { target: { value: 'coffee' } })

    expect(useTransactionFiltersStore.getState().search).toBe('')

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(useTransactionFiltersStore.getState().search).toBe('coffee')
  })
})

// ─── 5. Optimistic create prepends to cache ────────────────────────────────
describe('useCreateTransaction', () => {
  it('optimistically prepends the row to the first page', async () => {
    const { qc, Wrapper } = buildWrapper()
    const key = transactionsQueryKey({})
    qc.setQueryData(key, {
      pageParams: [undefined],
      pages: [{ items: [], nextCursor: null }],
    })

    vi.mocked(txApi.createTransaction).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ transaction: mkTx({ id: 'server-id', note: 'New' }) }),
            50
          )
        )
    )

    const { result } = renderHook(() => useCreateTransaction({}), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.mutate({
        amount: 50,
        date: new Date().toISOString(),
        note: 'New',
        isIncome: false,
        categoryId: 'cat-1',
      })
    })

    await waitFor(() => {
      const cache = qc.getQueryData(key) as {
        pages: Array<{ items: Transaction[] }>
      }
      expect(cache.pages[0].items.length).toBe(1)
      expect(cache.pages[0].items[0].note).toBe('New')
    })
  })
})

// ─── 6. Swipe-delete fires onDelete past threshold ─────────────────────────
describe('TransactionItem swipe', () => {
  it('calls onDelete when swiped left past the 80px threshold', async () => {
    const tx = mkTx({ id: 'swipe-tx', note: 'Coffee' })
    const onDelete = vi.fn()

    render(<TransactionItem transaction={tx} onDelete={onDelete} />)

    const row = screen.getByTestId('transaction-swipe-tx')

    // Notes for this gesture setup (axis: 'x', pointer.capture: false):
    //  - `buttons: 1` required — use-gesture checks `event.buttons` (bitmask), not `button`.
    //  - `pointerType: 'mouse'` required — for non-mouse pointer types use-gesture
    //    routes through scroll-prevention (native scrolling on x-axis drag), which
    //    does not fire the drag callback synchronously in jsdom.
    //  - Follow-up move/up target window because `pointer.capture: false` causes
    //    use-gesture to bind move/end listeners to window.
    const init = { pointerId: 1, clientY: 50, pointerType: 'mouse', bubbles: true }
    fireEvent.pointerDown(row, { ...init, clientX: 200, button: 0, buttons: 1 })
    fireEvent.pointerMove(window, { ...init, clientX: 100, buttons: 1 })
    fireEvent.pointerMove(window, { ...init, clientX: 60, buttons: 1 })
    fireEvent.pointerUp(window, { ...init, clientX: 60, buttons: 0 })

    await waitFor(
      () => {
        expect(onDelete).toHaveBeenCalledWith(tx)
      },
      { timeout: 2000 }
    )
  })
})

// ─── 7. useDeleteTransactionWithUndo — remove + timeout DELETE ─────────────
describe('useDeleteTransactionWithUndo', () => {
  it('removes item immediately, shows undo toast, fires DELETE on timeout', async () => {
    vi.useFakeTimers()
    const { qc, Wrapper } = buildWrapper()
    const key = transactionsQueryKey({})
    const tx = mkTx({ id: 'del-1' })
    qc.setQueryData(key, {
      pageParams: [undefined],
      pages: [{ items: [tx], nextCursor: null }],
    })
    vi.mocked(txApi.deleteTransaction).mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteTransactionWithUndo({}), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current(tx)
    })

    // Cache: item gone
    const cache = qc.getQueryData(key) as {
      pages: Array<{ items: Transaction[] }>
    }
    expect(cache.pages[0].items.length).toBe(0)

    // toastAction called
    expect(toastMod.toastAction).toHaveBeenCalledTimes(1)
    const [, opts] = vi.mocked(toastMod.toastAction).mock.calls[0]
    expect(opts.label).toBe('Undo')

    // DELETE not fired yet
    expect(txApi.deleteTransaction).not.toHaveBeenCalled()

    // Advance past 5s
    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })

    expect(txApi.deleteTransaction).toHaveBeenCalledWith('del-1')
  })

  it('undo restores item and cancels DELETE', async () => {
    vi.useFakeTimers()
    const { qc, Wrapper } = buildWrapper()
    const key = transactionsQueryKey({})
    const tx = mkTx({ id: 'del-2' })
    qc.setQueryData(key, {
      pageParams: [undefined],
      pages: [{ items: [tx], nextCursor: null }],
    })
    vi.mocked(txApi.deleteTransaction).mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteTransactionWithUndo({}), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current(tx)
    })

    expect(
      (qc.getQueryData(key) as { pages: Array<{ items: Transaction[] }> })
        .pages[0].items.length
    ).toBe(0)

    // Trigger undo via the captured onClick
    const [, opts] = vi.mocked(toastMod.toastAction).mock.calls[0]
    act(() => {
      opts.onClick()
    })

    // Item restored
    expect(
      (qc.getQueryData(key) as { pages: Array<{ items: Transaction[] }> })
        .pages[0].items.length
    ).toBe(1)

    // Advance — DELETE must NOT fire
    await act(async () => {
      vi.advanceTimersByTime(5000)
      await Promise.resolve()
    })
    expect(txApi.deleteTransaction).not.toHaveBeenCalled()
  })
})
