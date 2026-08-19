'use client'

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

import { formatINR } from '@/lib/utils/currency'
import { budgetHealth, HEALTH_TEXT_CLASS } from '@/lib/utils/budgetProgress'
import type { BudgetWithProgress } from '@/lib/api/budgets'

const SPENT_COLOUR = 'var(--accent)'
const REMAINING_COLOUR = 'var(--muted)'

interface BudgetDonutSummaryProps {
  budgets: BudgetWithProgress[]
}

/** Aggregate budget health across every budget: total spent vs total limit. */
export function BudgetDonutSummary({ budgets }: BudgetDonutSummaryProps) {
  const totalLimit = budgets.reduce((sum, b) => sum + b.amount, 0)
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0)
  const remaining = Math.max(totalLimit - totalSpent, 0)
  const percent = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0

  // Recharts renders nothing for an all-zero dataset, so fall back to a single
  // full "remaining" slice to keep the ring visible on a fresh account.
  const data =
    totalSpent === 0 && remaining === 0
      ? [{ name: 'Remaining', value: 1 }]
      : [
          { name: 'Spent', value: totalSpent },
          { name: 'Remaining', value: remaining },
        ]

  return (
    <div
      data-testid="budget-donut-summary"
      className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <div className="relative h-28 w-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="70%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={entry.name === 'Spent' ? SPENT_COLOUR : REMAINING_COLOUR}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-lg font-bold ${HEALTH_TEXT_CLASS[budgetHealth(percent)]}`}>
            {percent}%
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)]">used</span>
        </div>
      </div>

      <dl className="min-w-0 flex-1 space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[var(--muted-foreground)]">Spent</dt>
          <dd className="font-semibold">{formatINR(totalSpent)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[var(--muted-foreground)]">Budgeted</dt>
          <dd className="font-semibold">{formatINR(totalLimit)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-[var(--border)] pt-1.5">
          <dt className="text-[var(--muted-foreground)]">Remaining</dt>
          <dd className="font-semibold">{formatINR(totalLimit - totalSpent)}</dd>
        </div>
      </dl>
    </div>
  )
}
