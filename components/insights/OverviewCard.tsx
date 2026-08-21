'use client'

import { formatINR } from '@/lib/utils/currency'
import type { Overview } from '@/lib/api/analytics'

interface OverviewCardProps {
  overview: Overview
}

export function OverviewCard({ overview }: OverviewCardProps) {
  const positive = overview.netBalance >= 0

  return (
    <div
      data-testid="overview-card"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">Income</dt>
          <dd className="text-lg font-semibold text-green-600 dark:text-green-400">
            {formatINR(overview.totalIncome)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">Expense</dt>
          <dd className="text-lg font-semibold text-red-600 dark:text-red-400">
            {formatINR(overview.totalExpense)}
          </dd>
        </div>
        <div className="col-span-2 border-t border-[var(--border)] pt-3">
          <dt className="text-xs text-[var(--muted-foreground)]">Net balance</dt>
          <dd
            data-testid="net-balance"
            className={`text-2xl font-bold ${
              positive
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatINR(overview.netBalance)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
        <span>
          {overview.transactionCount}{' '}
          {overview.transactionCount === 1 ? 'transaction' : 'transactions'}
        </span>
        <span>{formatINR(overview.avgDailySpend)} / day avg</span>
      </div>
    </div>
  )
}
