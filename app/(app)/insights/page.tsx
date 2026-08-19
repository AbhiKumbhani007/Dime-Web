'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { endOfDay, startOfDay } from 'date-fns'
import type { DateRange } from 'react-day-picker'

import { Skeleton } from '@/components/ui/skeleton'
import { PeriodNavigator } from '@/components/insights/PeriodNavigator'
import { OverviewCard } from '@/components/insights/OverviewCard'
import { IncomeExpenseBarChart } from '@/components/insights/IncomeExpenseBarChart'
import { CategoryDonut } from '@/components/insights/CategoryDonut'
import { CollapsibleSection } from '@/components/insights/CollapsibleSection'
import { TrendsChart, NetCashflowChart } from '@/components/insights/TrendsChart'
import { BudgetVsActualChart } from '@/components/insights/BudgetVsActualChart'
import { TopDaysList } from '@/components/insights/TopDaysList'
import { SpendingVelocity } from '@/components/insights/SpendingVelocity'
import { DateRangePicker } from '@/components/insights/DateRangePicker'
import {
  useAnalyticsOverview,
  useAnalyticsByPeriod,
  useAnalyticsByCategory,
  useTrends,
  useTopDays,
  useBudgetVsActual,
} from '@/hooks/useAnalytics'
import { useBudgets } from '@/hooks/useBudgets'
import { useCategories } from '@/hooks/useCategories'
import { periodBounds, toISO } from '@/lib/utils/analyticsPeriod'
import { ANALYTICS_PERIODS, type AnalyticsPeriod } from '@/lib/api/analytics'

export default function InsightsPage() {
  const router = useRouter()

  const [period, setPeriod] = useState<AnalyticsPeriod>('monthly')
  const [date, setDate] = useState(() => new Date())
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)
  const [donutIsIncome, setDonutIsIncome] = useState(false)
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)

  // A custom range overrides the period tabs entirely, for every chart.
  const usingCustomRange = Boolean(customRange?.from)

  const { start, end } = useMemo(() => {
    if (customRange?.from) {
      return {
        start: startOfDay(customRange.from),
        end: endOfDay(customRange.to ?? customRange.from),
      }
    }
    return periodBounds(period, date)
  }, [customRange, period, date])

  const range = useMemo(() => ({ from: toISO(start), to: toISO(end) }), [start, end])

  const overview = useAnalyticsOverview(range)
  const byPeriod = useAnalyticsByPeriod({
    period,
    // The bucket series is period-shaped, so a custom range is expressed by
    // pointing the reference date at the range's start.
    date: toISO(usingCustomRange ? start : date),
    categoryId,
  })
  const byCategory = useAnalyticsByCategory({ ...range, isIncome: donutIsIncome })
  const trends = useTrends({ months: 6 })
  const topDays = useTopDays({ ...range, limit: 10 })
  const budgetVsActual = useBudgetVsActual()
  const budgets = useBudgets()
  const { data: categoriesData } = useCategories()

  const categories = categoriesData?.categories ?? []

  // The category filter narrows the donut as well as the bar chart. The
  // breakdown endpoint always returns every category, so filter client-side
  // rather than round-tripping for a single slice.
  const donutRows = useMemo(() => {
    const rows = byCategory.data?.categories ?? []
    return categoryId ? rows.filter((r) => r.category?.id === categoryId) : rows
  }, [byCategory.data, categoryId])

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-4 p-4 pb-24">
      {/* Period tabs */}
      <div role="tablist" aria-label="Period" className="grid grid-cols-3 gap-1.5">
        {ANALYTICS_PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={period === p.value}
            onClick={() => setPeriod(p.value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              period === p.value
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <DateRangePicker value={customRange} onChange={setCustomRange} />

      {!usingCustomRange && (
        <PeriodNavigator period={period} date={date} onChange={setDate} />
      )}

      {/* Overview */}
      {overview.isLoading ? (
        <Skeleton data-testid="overview-skeleton" className="h-36 w-full rounded-2xl" />
      ) : overview.data ? (
        <OverviewCard overview={overview.data} />
      ) : null}

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="w-full min-w-0 overflow-x-auto no-scrollbar pb-1">
          <div role="radiogroup" aria-label="Filter by category" className="flex w-max gap-1.5">
            <button
              type="button"
              role="radio"
              aria-checked={categoryId === undefined}
              onClick={() => setCategoryId(undefined)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-all ${
                categoryId === undefined
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border border-[var(--border)] bg-[var(--card)]'
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                role="radio"
                aria-checked={categoryId === category.id}
                onClick={() =>
                  setCategoryId((current) => (current === category.id ? undefined : category.id))
                }
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-all ${
                  categoryId === category.id
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'border border-[var(--border)] bg-[var(--card)]'
                }`}
              >
                {category.emoji} {category.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bar chart */}
      {byPeriod.isLoading ? (
        <Skeleton data-testid="chart-skeleton" className="h-56 w-full rounded-2xl" />
      ) : byPeriod.data ? (
        <IncomeExpenseBarChart
          data={byPeriod.data}
          onBarClick={() => router.push('/log')}
        />
      ) : null}

      {/* Category donut with an income/expense toggle */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">By category</h2>
        <div role="radiogroup" aria-label="Donut type" className="flex gap-1.5">
          {[
            { label: 'Expense', value: false },
            { label: 'Income', value: true },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={donutIsIncome === option.value}
              onClick={() => setDonutIsIncome(option.value)}
              className={`rounded-full px-3 py-1 text-xs transition-all ${
                donutIsIncome === option.value
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                  : 'border border-[var(--border)] bg-[var(--card)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {byCategory.isLoading ? (
        <Skeleton data-testid="donut-skeleton" className="h-48 w-full rounded-2xl" />
      ) : (
        <CategoryDonut rows={donutRows} />
      )}

      {/* ── Advanced analytics (F09) ─────────────────────────────────────── */}
      <h2 className="mt-2 text-sm font-semibold">More analytics</h2>

      <CollapsibleSection title="Trends (6 months)">
        {trends.isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <TrendsChart trends={trends.data?.trends ?? []} />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Net cashflow">
        {trends.isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <NetCashflowChart trends={trends.data?.trends ?? []} />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Budget vs actual">
        {budgetVsActual.isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <BudgetVsActualChart rows={budgetVsActual.data?.budgets ?? []} />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Top spending days">
        {topDays.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <TopDaysList days={topDays.data?.days ?? []} />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Spending velocity">
        {budgets.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <SpendingVelocity budgets={budgets.data?.budgets ?? []} />
        )}
      </CollapsibleSection>
    </div>
  )
}
