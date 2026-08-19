'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatINR, formatINRCompact } from '@/lib/utils/currency'
import type { BudgetVsActualRow } from '@/lib/api/analytics'

const ALLOCATED_COLOUR = '#94a3b8'
const SPENT_COLOUR = '#6366f1'

export function BudgetVsActualChart({ rows }: { rows: BudgetVsActualRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No budgets yet — create one to compare it against actual spend.
      </p>
    )
  }

  const data = rows.map((r) => ({
    label: r.budget.name,
    allocated: r.allocated,
    spent: r.spent,
  }))

  return (
    <div data-testid="budget-vs-actual-chart" className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            tickFormatter={(v: number) => formatINRCompact(v)}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            formatter={(value, name) => [formatINR(Number(value)), String(name)]}
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="allocated"
            name="Budgeted"
            fill={ALLOCATED_COLOUR}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="spent"
            name="Actual"
            fill={SPENT_COLOUR}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
