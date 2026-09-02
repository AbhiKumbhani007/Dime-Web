'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { endOfDay, startOfDay } from 'date-fns'
import type { DateRange } from 'react-day-picker'

import { Skeleton } from '@/components/ui/skeleton'
import { ChipRow } from '@/components/ui/chip-row'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Panel, PanelLegend } from '@/components/insights/Panel'
import { PeriodNavigator } from '@/components/insights/PeriodNavigator'
import { OverviewCard } from '@/components/insights/OverviewCard'
import { IncomeExpenseBarChart } from '@/components/insights/IncomeExpenseBarChart'
import { CategoryDonut } from '@/components/insights/CategoryDonut'
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
import { cn } from '@/lib/utils'

const DONUT_OPTIONS = [
  { value: 'expense' as const, label: 'Out' },
  { value: 'income' as const, label: 'In' },
]

const CHIP =
  'flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 ' +
  'text-[12.5px] font-medium whitespace-nowrap transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-ring'
const CHIP_ON = 'border-accent bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent'
const CHIP_OFF = 'border-border bg-card text-foreground hover:border-accent'

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
    <div className="flex min-h-full w-full min-w-0 flex-col gap-(--gap) p-(--pad-page)">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <SegmentedControl
          label="Period"
          role="tablist"
          options={ANALYTICS_PERIODS.map((p) => ({ value: p.value, label: p.label }))}
          value={period}
          onChange={setPeriod}
        />

        {!usingCustomRange && (
          <PeriodNavigator period={period} date={date} onChange={setDate} />
        )}

        <div className="ml-auto flex min-w-0 items-center gap-3">
          <DateRangePicker value={customRange} onChange={setCustomRange} />
        </div>
      </div>

      {categories.length > 0 && (
        <ChipRow label="Filter by category" role="radiogroup">
          <button
            type="button"
            role="radio"
            aria-checked={categoryId === undefined}
            onClick={() => setCategoryId(undefined)}
            className={cn(CHIP, categoryId === undefined ? CHIP_ON : CHIP_OFF)}
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
              className={cn(CHIP, categoryId === category.id ? CHIP_ON : CHIP_OFF)}
            >
              <span aria-hidden>{category.emoji}</span>
              <span className="max-w-[12ch] truncate">{category.name}</span>
            </button>
          ))}
        </ChipRow>
      )}

      {overview.isLoading ? (
        <Skeleton data-testid="overview-skeleton" className="h-[92px] w-full rounded-[14px]" />
      ) : overview.data ? (
        <OverviewCard overview={overview.data} />
      ) : null}

      {/* Primary row: the bar series gets twice the width of the donut. */}
      <div className="grid min-w-0 gap-(--gap) lg:grid-cols-[2fr_1fr]">
        <Panel
          title="Income vs expense"
          aside={
            <PanelLegend
              items={[
                { label: 'Income', colour: 'var(--income)' },
                { label: 'Expense', colour: 'var(--expense)' },
                { label: 'Avg', colour: 'var(--muted-foreground)', dashed: true },
              ]}
            />
          }
        >
          {byPeriod.isLoading ? (
            <Skeleton data-testid="chart-skeleton" className="h-56 w-full rounded-xl" />
          ) : byPeriod.data ? (
            <IncomeExpenseBarChart data={byPeriod.data} onBarClick={() => router.push('/log')} />
          ) : null}
        </Panel>

        <Panel
          title="By category"
          aside={
            <SegmentedControl
              size="sm"
              label="Donut type"
              options={DONUT_OPTIONS}
              value={donutIsIncome ? 'income' : 'expense'}
              onChange={(v) => setDonutIsIncome(v === 'income')}
            />
          }
        >
          {byCategory.isLoading ? (
            <Skeleton data-testid="donut-skeleton" className="h-48 w-full rounded-xl" />
          ) : (
            <CategoryDonut rows={donutRows} />
          )}
        </Panel>
      </div>

      {/* Everything that used to sit behind an accordion. The design's rule is
          "every panel visible", so these are plain panels on a 3-up grid. */}
      <div className="grid min-w-0 gap-(--gap) lg:grid-cols-3">
        <Panel title="Trends" aside={<span className="text-[10.5px] text-muted-foreground">6 months</span>}>
          {trends.isLoading ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : (
            <TrendsChart trends={trends.data?.trends ?? []} />
          )}
        </Panel>

        <Panel
          title="Budget vs actual"
          aside={
            <PanelLegend
              items={[
                { label: 'Budget', colour: 'var(--chart-budgeted)' },
                { label: 'Actual', colour: 'var(--chart-net)' },
              ]}
            />
          }
        >
          {budgetVsActual.isLoading ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : (
            <BudgetVsActualChart rows={budgetVsActual.data?.budgets ?? []} />
          )}
        </Panel>

        <Panel title="Spending velocity">
          {budgets.isLoading ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : (
            <SpendingVelocity budgets={budgets.data?.budgets ?? []} />
          )}
        </Panel>
      </div>

      <div className="grid min-w-0 gap-(--gap) lg:grid-cols-2">
        <Panel title="Net cashflow" aside={<span className="text-[10.5px] text-muted-foreground">cumulative</span>}>
          {trends.isLoading ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : (
            <NetCashflowChart trends={trends.data?.trends ?? []} />
          )}
        </Panel>

        <Panel title="Top spending days">
          {topDays.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : (
            <TopDaysList days={topDays.data?.days ?? []} />
          )}
        </Panel>
      </div>
    </div>
  )
}
