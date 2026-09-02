'use client'

import { useMemo } from 'react'
import { KpiCard } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnalyticsOverview } from '@/hooks/useAnalytics'
import { formatINR } from '@/lib/utils/currency'
import { startOfMonth, toISODateString } from '@/lib/utils/date'

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * The four figures above the transaction table, scoped to the current calendar
 * month. Built from /api/analytics/overview, which already returns everything
 * needed — no new endpoint.
 */
export function LogKpis() {
  const range = useMemo(() => {
    const now = new Date()
    return { from: toISODateString(startOfMonth(now)), to: toISODateString(now) }
  }, [])

  const { data, isPending, isError } = useAnalyticsOverview(range)

  if (isPending) {
    return (
      <div
        data-testid="log-kpis-skeleton"
        className="grid grid-cols-2 gap-(--gap) md:grid-cols-4"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-[14px]" />
        ))}
      </div>
    )
  }

  // A KPI strip is a summary, not the content — if it fails, the table below is
  // still the point of the screen, so fail quietly rather than with an error card.
  if (isError || !data) return null

  const daysElapsed = new Date().getDate()
  const net = data.netBalance

  return (
    <div data-testid="log-kpis" className="grid grid-cols-2 gap-(--gap) md:grid-cols-4">
      <KpiCard
        label="This month in"
        value={formatINR(data.totalIncome)}
        tone="var(--income)"
        sub={plural(data.transactionCount, 'transaction')}
      />
      <KpiCard
        label="This month out"
        value={formatINR(data.totalExpense)}
        tone="var(--expense)"
        sub={`${plural(daysElapsed, 'day')} elapsed`}
      />
      <KpiCard
        label="Net"
        value={`${net >= 0 ? '+' : '−'}${formatINR(Math.abs(net))}`}
        tone={net >= 0 ? 'var(--income)' : 'var(--expense)'}
        sub={net >= 0 ? 'in the black' : 'spending over income'}
      />
      <KpiCard
        label="Daily average"
        value={formatINR(data.avgDailySpend)}
        sub="spend per day"
      />
    </div>
  )
}
