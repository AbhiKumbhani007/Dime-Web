'use client'

import { formatINR } from '@/lib/utils/currency'
import { spendingVelocity } from '@/lib/utils/spendingVelocity'
import type { BudgetWithProgress } from '@/lib/api/budgets'

const STATUS_LABEL = {
  over: 'Over pace',
  'on-track': 'On track',
  under: 'Under pace',
} as const

const STATUS_CLASS = {
  over: 'text-red-600 dark:text-red-400',
  'on-track': 'text-green-600 dark:text-green-400',
  under: 'text-[var(--muted-foreground)]',
} as const

export function SpendingVelocity({ budgets }: { budgets: BudgetWithProgress[] }) {
  const rows = budgets
    .map((budget) => ({ budget, velocity: spendingVelocity(budget) }))
    .filter((r): r is { budget: BudgetWithProgress; velocity: NonNullable<ReturnType<typeof spendingVelocity>> } => r.velocity !== null)

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No active budgets to measure pace against.
      </p>
    )
  }

  return (
    <ul data-testid="spending-velocity" className="space-y-3">
      {rows.map(({ budget, velocity }) => (
        <li key={budget.id} className="flex items-center gap-3 text-sm">
          <span aria-hidden="true" className="text-lg">
            {budget.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{budget.name}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {velocity.elapsedPercent}% of period elapsed · projected{' '}
              {formatINR(velocity.projected)}
            </p>
          </div>
          <span className={`shrink-0 text-right text-xs font-medium ${STATUS_CLASS[velocity.status]}`}>
            {STATUS_LABEL[velocity.status]}
            <span className="block font-normal">{velocity.pace.toFixed(2)}×</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
