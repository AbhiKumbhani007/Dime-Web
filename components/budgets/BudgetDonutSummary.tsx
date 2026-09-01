'use client'

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

import { formatINR } from '@/lib/utils/currency'
import { budgetHealth, HEALTH_TEXT_CLASS } from '@/lib/utils/budgetProgress'
import type { BudgetWithProgress } from '@/lib/api/budgets'

const SPENT_COLOUR = 'var(--accent)'
const REMAINING_COLOUR = 'var(--muted)'

const BANDS = [
  { label: 'Under 75%', health: 'safe', colour: 'var(--income)' },
  { label: '75 – 90%', health: 'warning', colour: 'var(--warning-fill)' },
  { label: 'Over 90%', health: 'danger', colour: 'var(--expense)' },
] as const

interface BudgetDonutSummaryProps {
  budgets: BudgetWithProgress[]
}

/** Aggregate budget health across every budget: total spent vs total limit. */
export function BudgetDonutSummary({ budgets }: BudgetDonutSummaryProps) {
  const totalLimit = budgets.reduce((sum, b) => sum + b.amount, 0)
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0)
  const remaining = Math.max(totalLimit - totalSpent, 0)
  const percent = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0

  const counts = budgets.reduce(
    (acc, b) => {
      acc[budgetHealth(b.percent)]++
      return acc
    },
    { safe: 0, warning: 0, danger: 0 },
  )

  // Recharts renders nothing for an all-zero dataset, so fall back to a single
  // full "remaining" slice to keep the ring visible on a fresh account.
  const data =
    totalSpent === 0 && remaining === 0
      ? [{ name: 'Remaining', value: 1 }]
      : [
          { name: 'Spent', value: totalSpent },
          { name: 'Remaining', value: remaining },
        ]

  const totals = [
    { label: 'Spent', value: formatINR(totalSpent), sub: `across ${budgets.length}` },
    { label: 'Budgeted', value: formatINR(totalLimit), sub: 'this period' },
    {
      label: 'Remaining',
      value: formatINR(totalLimit - totalSpent),
      sub: totalLimit - totalSpent < 0 ? 'overspent' : 'left to spend',
    },
  ]

  return (
    <div
      data-testid="budget-donut-summary"
      className="flex flex-wrap items-center gap-6 rounded-2xl border border-border bg-card p-(--pad-card)"
    >
      <div className="relative h-[126px] w-[126px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="74%"
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
          <span
            className={`font-mono text-2xl font-bold tracking-[-0.03em] ${HEALTH_TEXT_CLASS[budgetHealth(percent)]}`}
          >
            {percent}%
          </span>
          <span className="text-[10.5px] text-muted-foreground">used</span>
        </div>
      </div>

      <dl className="grid min-w-[300px] flex-1 grid-cols-3 gap-5">
        {totals.map(({ label, value, sub }) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xl font-bold tracking-[-0.025em]">{value}</dd>
            <span className="text-[10.5px] text-muted-foreground">{sub}</span>
          </div>
        ))}
      </dl>

      <div className="flex min-w-[168px] shrink-0 flex-col gap-[7px]">
        <h3 className="font-mono text-[10px] font-semibold tracking-[0.09em] text-muted-foreground">
          HEALTH
        </h3>
        {BANDS.map(({ label, health, colour }) => (
          <div key={label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
              style={{ background: colour }}
            />
            <span className="min-w-0 flex-1 text-[11.5px] text-muted-foreground">{label}</span>
            <span className="shrink-0 font-mono text-[11.5px] font-semibold">
              {counts[health]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
