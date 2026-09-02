'use client'

import { KpiCard } from '@/components/ui/kpi-card'
import { formatINR } from '@/lib/utils/currency'
import type { Overview } from '@/lib/api/analytics'

interface OverviewCardProps {
  overview: Overview
}

/**
 * The four headline figures for the selected period. Still one component (and
 * still `overview-card`) so the period/range plumbing has a single consumer,
 * but it now renders as the KPI strip the design puts above the charts.
 */
export function OverviewCard({ overview }: OverviewCardProps) {
  const net = overview.netBalance
  const positive = net >= 0
  const { transactionCount: count } = overview

  return (
    <div
      data-testid="overview-card"
      className="grid grid-cols-2 gap-(--gap) md:grid-cols-4"
    >
      <KpiCard
        label="Income"
        value={formatINR(overview.totalIncome)}
        tone="var(--income)"
        sub="received this period"
      />
      <KpiCard
        label="Expense"
        value={formatINR(overview.totalExpense)}
        tone="var(--expense)"
        sub={`${count} ${count === 1 ? 'transaction' : 'transactions'}`}
      />
      {/* net-balance keeps the raw formatINR output — tests read this value. */}
      <KpiCard
        label="Net balance"
        value={formatINR(net)}
        tone={positive ? 'var(--income)' : 'var(--expense)'}
        sub={positive ? 'in the black' : 'spending over income'}
        valueTestId="net-balance"
      />
      <KpiCard
        label="Average per day"
        value={formatINR(overview.avgDailySpend)}
        sub={`${formatINR(overview.avgDailySpend)} / day avg`}
      />
    </div>
  )
}
