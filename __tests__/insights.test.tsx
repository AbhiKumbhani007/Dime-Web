import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => '/insights',
}))
const mockPush = vi.fn()

// Recharts needs a real layout box; jsdom reports 0×0, so ResponsiveContainer
// renders nothing. Stub it with a fixed-size div so the charts mount.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 400, height: 300 }}>{children}</div>
    ),
  }
})

const mockOverview = vi.fn()
const mockByPeriod = vi.fn()
const mockByCategory = vi.fn()
const mockTrends = vi.fn()
const mockTopDays = vi.fn()
const mockBudgetVsActual = vi.fn()

vi.mock('@/hooks/useAnalytics', () => ({
  ANALYTICS_KEY: ['analytics'],
  useAnalyticsOverview: (p: unknown) => mockOverview(p),
  useAnalyticsByPeriod: (p: unknown) => mockByPeriod(p),
  useAnalyticsByCategory: (p: unknown) => mockByCategory(p),
  useTrends: (p: unknown) => mockTrends(p),
  useTopDays: (p: unknown) => mockTopDays(p),
  useBudgetVsActual: () => mockBudgetVsActual(),
}))

const mockUseBudgets = vi.fn()
vi.mock('@/hooks/useBudgets', () => ({
  BUDGETS_KEY: ['budgets'],
  useBudgets: () => mockUseBudgets(),
}))

vi.mock('@/hooks/useCategories', () => ({
  CATEGORIES_KEY: ['categories'],
  useCategories: () => ({
    data: {
      categories: [
        { id: 'cat-1', name: 'Food', emoji: '🍔', color: '#ef4444', isDefault: true, userId: 'u', createdAt: '' },
        { id: 'cat-2', name: 'Transport', emoji: '🚌', color: '#3b82f6', isDefault: true, userId: 'u', createdAt: '' },
      ],
    },
    isLoading: false,
    error: null,
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
  useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import InsightsPage from '@/app/(app)/insights/page'
import { OverviewCard } from '@/components/insights/OverviewCard'
import { CategoryDonut } from '@/components/insights/CategoryDonut'
import { TopDaysList } from '@/components/insights/TopDaysList'
import { PeriodNavigator } from '@/components/insights/PeriodNavigator'
import { CollapsibleSection } from '@/components/insights/CollapsibleSection'
import { BudgetVsActualChart } from '@/components/insights/BudgetVsActualChart'
import {
  periodLabel,
  periodBounds,
  shiftPeriod,
  isCurrentPeriod,
} from '@/lib/utils/analyticsPeriod'
import { spendingVelocity } from '@/lib/utils/spendingVelocity'
import type { BudgetWithProgress } from '@/lib/api/budgets'

const OVERVIEW = {
  totalIncome: 50000,
  totalExpense: 30000,
  netBalance: 20000,
  transactionCount: 12,
  avgDailySpend: 1000,
  from: '2026-04-01T00:00:00.000Z',
  to: '2026-04-30T23:59:59.999Z',
}

const BY_PERIOD = {
  period: 'weekly' as const,
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  income: [0, 0, 1000, 0, 0, 0, 0],
  expense: [150, 0, 0, 300, 0, 0, 0],
  net: [-150, 0, 1000, -300, 0, 0, 0],
  from: '2026-04-13T00:00:00.000Z',
  to: '2026-04-19T23:59:59.999Z',
}

const CATEGORY_ROWS = [
  {
    // Ids match the useCategories mock — in production both come from the same
    // category records, and the donut filter relies on that.
    category: { id: 'cat-1', name: 'Food', emoji: '🍔', color: '#f97316' },
    total: 750,
    percent: 75,
    count: 3,
  },
  {
    category: { id: 'cat-2', name: 'Transport', emoji: '🚌', color: '#3b82f6' },
    total: 250,
    percent: 25,
    count: 1,
  },
]

const TRENDS = [
  { month: '2026-03', income: 0, expense: 500, net: -500 },
  { month: '2026-04', income: 2000, expense: 800, net: 1200 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockOverview.mockReturnValue({ data: OVERVIEW, isLoading: false })
  mockByPeriod.mockReturnValue({ data: BY_PERIOD, isLoading: false })
  mockByCategory.mockReturnValue({ data: { categories: CATEGORY_ROWS }, isLoading: false })
  mockTrends.mockReturnValue({ data: { trends: TRENDS }, isLoading: false })
  mockTopDays.mockReturnValue({ data: { days: [] }, isLoading: false })
  mockBudgetVsActual.mockReturnValue({ data: { budgets: [] }, isLoading: false })
  mockUseBudgets.mockReturnValue({ data: { budgets: [] }, isLoading: false })
})

// ─── Period utilities ─────────────────────────────────────────────────────────

describe('analyticsPeriod utils', () => {
  it('weekly bounds run Monday to Sunday', () => {
    const { start, end } = periodBounds('weekly', new Date(2026, 3, 15)) // Wed
    expect(start.getDay()).toBe(1)
    expect(start.getDate()).toBe(13)
    expect(end.getDate()).toBe(19)
  })

  it('monthly bounds cover the whole calendar month', () => {
    const { start, end } = periodBounds('monthly', new Date(2026, 3, 15))
    expect(start.getDate()).toBe(1)
    expect(end.getDate()).toBe(30)
  })

  it('yearly bounds cover Jan 1 to Dec 31', () => {
    const { start, end } = periodBounds('yearly', new Date(2026, 5, 5))
    expect(start.getMonth()).toBe(0)
    expect(end.getMonth()).toBe(11)
    expect(end.getDate()).toBe(31)
  })

  it('shiftPeriod moves by one unit in each direction', () => {
    const base = new Date(2026, 3, 15)
    expect(shiftPeriod('weekly', base, 1).getDate()).toBe(22)
    expect(shiftPeriod('weekly', base, -1).getDate()).toBe(8)
    expect(shiftPeriod('monthly', base, 1).getMonth()).toBe(4)
    expect(shiftPeriod('yearly', base, -1).getFullYear()).toBe(2025)
  })

  it('periodLabel formats each period readably', () => {
    expect(periodLabel('monthly', new Date(2026, 3, 15))).toBe('April 2026')
    expect(periodLabel('yearly', new Date(2026, 3, 15))).toBe('2026')
    expect(periodLabel('weekly', new Date(2026, 3, 15))).toMatch(/13.*19 Apr 2026/)
  })

  it('isCurrentPeriod is true only for the period containing now', () => {
    const now = new Date(2026, 3, 15)
    expect(isCurrentPeriod('monthly', new Date(2026, 3, 2), now)).toBe(true)
    expect(isCurrentPeriod('monthly', new Date(2026, 2, 2), now)).toBe(false)
  })
})

// ─── Spending velocity ────────────────────────────────────────────────────────

describe('spendingVelocity', () => {
  function budget(overrides: Partial<BudgetWithProgress> = {}): BudgetWithProgress {
    return {
      id: 'b1',
      name: 'Groceries',
      emoji: '🛒',
      colour: '#6366f1',
      type: 'MONTHLY',
      amount: 10000,
      startDate: '',
      userId: 'u',
      categoryId: 'c1',
      createdAt: '',
      updatedAt: '',
      spent: 5000,
      remaining: 5000,
      percent: 50,
      daysRemaining: 15,
      periodStart: new Date(2026, 3, 1).toISOString(),
      periodEnd: new Date(2026, 3, 30, 23, 59, 59).toISOString(),
      ...overrides,
    }
  }

  it('reports on-track when spend matches elapsed time', () => {
    // Halfway through April, 50% spent → pace ≈ 1.0
    const v = spendingVelocity(budget(), new Date(2026, 3, 15, 12))
    expect(v?.status).toBe('on-track')
    expect(v?.pace).toBeCloseTo(1, 1)
  })

  it('reports over pace when spending outruns the clock', () => {
    const v = spendingVelocity(budget({ spent: 9000 }), new Date(2026, 3, 15, 12))
    expect(v?.status).toBe('over')
    expect(v!.pace).toBeGreaterThan(1.1)
  })

  it('reports under pace when spending lags', () => {
    const v = spendingVelocity(budget({ spent: 1000 }), new Date(2026, 3, 15, 12))
    expect(v?.status).toBe('under')
  })

  it('projects the full-period spend', () => {
    const v = spendingVelocity(budget(), new Date(2026, 3, 15, 12))
    expect(v!.projected).toBeGreaterThan(9000)
    expect(v!.projected).toBeLessThan(11000)
  })

  it('returns null before the period starts rather than dividing by zero', () => {
    expect(spendingVelocity(budget(), new Date(2026, 2, 1))).toBeNull()
  })

  it('returns null for a zero-limit budget', () => {
    expect(spendingVelocity(budget({ amount: 0 }), new Date(2026, 3, 15))).toBeNull()
  })
})

// ─── Components ───────────────────────────────────────────────────────────────

describe('OverviewCard', () => {
  it('shows income, expense, net and the footer stats', () => {
    render(<OverviewCard overview={OVERVIEW} />)

    expect(screen.getByText(/50,000/)).toBeInTheDocument()
    expect(screen.getByText(/30,000/)).toBeInTheDocument()
    expect(screen.getByTestId('net-balance')).toHaveTextContent(/20,000/)
    expect(screen.getByText('12 transactions')).toBeInTheDocument()
    expect(screen.getByText(/1,000.00 \/ day avg/)).toBeInTheDocument()
  })

  it('colours a negative net balance as a loss', () => {
    render(<OverviewCard overview={{ ...OVERVIEW, netBalance: -500 }} />)
    expect(screen.getByTestId('net-balance').className).toMatch(/text-red/)
  })

  it('singularises a single transaction', () => {
    render(<OverviewCard overview={{ ...OVERVIEW, transactionCount: 1 }} />)
    expect(screen.getByText('1 transaction')).toBeInTheDocument()
  })
})

describe('CategoryDonut', () => {
  it('lists each category with its percent', () => {
    render(<CategoryDonut rows={CATEGORY_ROWS} />)

    const donut = screen.getByTestId('category-donut')
    expect(within(donut).getByText(/Food/)).toBeInTheDocument()
    expect(within(donut).getByText('75%')).toBeInTheDocument()
    expect(within(donut).getByText('25%')).toBeInTheDocument()
  })

  it('percentages in the legend sum to 100', () => {
    render(<CategoryDonut rows={CATEGORY_ROWS} />)
    const percents = screen
      .getAllByText(/^\d+(\.\d+)?%$/)
      .map((el) => parseFloat(el.textContent!))
    expect(percents.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1)
  })

  it('shows an empty state when there is no spending', () => {
    render(<CategoryDonut rows={[]} />)
    expect(screen.getByTestId('category-donut-empty')).toBeInTheDocument()
  })
})

describe('TopDaysList', () => {
  it('renders days in the order given (already sorted by the API)', () => {
    render(
      <TopDaysList
        days={[
          { date: '2026-04-07', total: 900 },
          { date: '2026-04-01', total: 150 },
        ]}
      />
    )

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('7 Apr 2026')
    expect(items[0]).toHaveTextContent(/900/)
    expect(items[1]).toHaveTextContent('1 Apr 2026')
  })

  it('shows an empty state with no data', () => {
    render(<TopDaysList days={[]} />)
    expect(screen.getByText(/No spending recorded/)).toBeInTheDocument()
  })
})

describe('BudgetVsActualChart', () => {
  it('prompts to create a budget when there are none', () => {
    render(<BudgetVsActualChart rows={[]} />)
    expect(screen.getByText(/No budgets yet/)).toBeInTheDocument()
  })
})

describe('PeriodNavigator', () => {
  it('steps backward and forward', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <PeriodNavigator period="monthly" date={new Date(2026, 3, 15)} onChange={onChange} />
    )

    await user.click(screen.getByRole('button', { name: 'Previous period' }))
    expect(onChange.mock.calls[0][0].getMonth()).toBe(2)
  })

  it('disables the next arrow on the current period', () => {
    render(<PeriodNavigator period="monthly" date={new Date()} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Next period' })).toBeDisabled()
  })

  it('enables the next arrow on a past period', () => {
    render(
      <PeriodNavigator period="monthly" date={new Date(2020, 0, 1)} onChange={() => {}} />
    )
    expect(screen.getByRole('button', { name: 'Next period' })).toBeEnabled()
  })
})

describe('CollapsibleSection', () => {
  it('is collapsed by default and expands on click', async () => {
    const user = userEvent.setup()
    render(
      <CollapsibleSection title="Trends">
        <p>panel content</p>
      </CollapsibleSection>
    )

    const toggle = screen.getByRole('button', { name: /Trends/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('panel content')).not.toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('panel content')).toBeInTheDocument()
  })

  it('honours defaultOpen', () => {
    render(
      <CollapsibleSection title="Trends" defaultOpen>
        <p>panel content</p>
      </CollapsibleSection>
    )
    expect(screen.getByText('panel content')).toBeInTheDocument()
  })
})

// ─── Page ─────────────────────────────────────────────────────────────────────

/** A day cell in the open date-range calendar, by its visible number. */
function pickDay(day: number): HTMLElement {
  const match = screen
    .getAllByRole('button')
    .find((b) => b.textContent === String(day) && b.hasAttribute('aria-label'))
  if (!match) throw new Error(`No calendar day button for ${day}`)
  return match
}

describe('InsightsPage', () => {
  it('defaults to the monthly tab', () => {
    render(<InsightsPage />)
    expect(screen.getByRole('tab', { name: 'Monthly' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('switching to the weekly tab requests weekly data', async () => {
    const user = userEvent.setup()
    render(<InsightsPage />)

    await user.click(screen.getByRole('tab', { name: 'Weekly' }))

    expect(screen.getByRole('tab', { name: 'Weekly' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    const lastCall = mockByPeriod.mock.calls.at(-1)![0]
    expect(lastCall.period).toBe('weekly')
  })

  it('renders the overview card and the bar chart', () => {
    render(<InsightsPage />)
    expect(screen.getByTestId('overview-card')).toBeInTheDocument()
    expect(screen.getByTestId('income-expense-chart')).toBeInTheDocument()
  })

  it('shows skeletons while the overview and chart load', () => {
    mockOverview.mockReturnValue({ data: undefined, isLoading: true })
    mockByPeriod.mockReturnValue({ data: undefined, isLoading: true })
    render(<InsightsPage />)

    expect(screen.getByTestId('overview-skeleton')).toBeInTheDocument()
    expect(screen.getByTestId('chart-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('overview-card')).not.toBeInTheDocument()
  })

  it('selecting a category filters the bar chart query', async () => {
    const user = userEvent.setup()
    render(<InsightsPage />)

    await user.click(screen.getByRole('radio', { name: /Food/ }))

    expect(mockByPeriod.mock.calls.at(-1)![0].categoryId).toBe('cat-1')
  })

  it('tapping the selected category again clears the filter', async () => {
    const user = userEvent.setup()
    render(<InsightsPage />)

    await user.click(screen.getByRole('radio', { name: /Food/ }))
    await user.click(screen.getByRole('radio', { name: /Food/ }))

    expect(mockByPeriod.mock.calls.at(-1)![0].categoryId).toBeUndefined()
  })

  it('the income/expense toggle switches the donut query', async () => {
    const user = userEvent.setup()
    render(<InsightsPage />)

    expect(mockByCategory.mock.calls.at(-1)![0].isIncome).toBe(false)

    await user.click(screen.getByRole('radio', { name: 'Income' }))
    expect(mockByCategory.mock.calls.at(-1)![0].isIncome).toBe(true)
  })

  it('stepping to the previous period updates the label and refetches', async () => {
    const user = userEvent.setup()
    render(<InsightsPage />)

    const before = screen.getByTestId('period-label').textContent
    await user.click(screen.getByRole('button', { name: 'Previous period' }))

    expect(screen.getByTestId('period-label').textContent).not.toBe(before)
    expect(mockByPeriod.mock.calls.length).toBeGreaterThan(1)
  })

  it('the category filter narrows the donut as well as the chart', async () => {
    const user = userEvent.setup()
    render(<InsightsPage />)

    // Both categories before filtering.
    const donut = screen.getByTestId('category-donut')
    expect(within(donut).getByText(/Food/)).toBeInTheDocument()
    expect(within(donut).getByText(/Transport/)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Food/ }))

    const filtered = screen.getByTestId('category-donut')
    expect(within(filtered).getByText(/Food/)).toBeInTheDocument()
    expect(within(filtered).queryByText(/Transport/)).not.toBeInTheDocument()
  })

  it('a custom date range replaces the period navigator and drives the queries', async () => {
    const user = userEvent.setup()
    render(<InsightsPage />)

    expect(screen.getByRole('button', { name: 'Previous period' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Custom date range/ }))
    // react-day-picker names each day with the full date, so match the number.
    await user.click(pickDay(10))
    await user.click(pickDay(20))
    await user.keyboard('{Escape}')

    // The navigator is gone — the range now governs the page.
    expect(screen.queryByRole('button', { name: 'Previous period' })).not.toBeInTheDocument()

    const lastRange = mockOverview.mock.calls.at(-1)![0]
    expect(new Date(lastRange.from).getDate()).toBe(10)
    expect(new Date(lastRange.to).getDate()).toBe(20)
  })

  it('clearing the custom range restores the period navigator', async () => {
    const user = userEvent.setup()
    render(<InsightsPage />)

    await user.click(screen.getByRole('button', { name: /Custom date range/ }))
    await user.click(pickDay(10))
    await user.click(pickDay(20))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Previous period' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear date range' }))
    expect(screen.getByRole('button', { name: 'Previous period' })).toBeInTheDocument()
  })

  it('renders all five advanced sections, collapsed', () => {
    render(<InsightsPage />)

    for (const title of [
      'Trends (6 months)',
      'Net cashflow',
      'Budget vs actual',
      'Top spending days',
      'Spending velocity',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(title.replace(/[()]/g, '.')) }))
        .toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('expanding Trends mounts the chart', async () => {
    const user = userEvent.setup()
    render(<InsightsPage />)

    expect(screen.queryByTestId('trends-chart')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Trends/ }))
    expect(screen.getByTestId('trends-chart')).toBeInTheDocument()
  })

  it('sections expand independently of one another', async () => {
    const user = userEvent.setup()
    render(<InsightsPage />)

    await user.click(screen.getByRole('button', { name: /Top spending days/ }))

    // Top days opened (empty fixture → its empty state)...
    expect(screen.getByText(/No spending recorded/)).toBeInTheDocument()
    // ...while Trends stayed shut.
    expect(screen.queryByTestId('trends-chart')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Trends/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })
})
