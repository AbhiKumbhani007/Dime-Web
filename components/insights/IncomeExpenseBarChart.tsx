'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion } from 'framer-motion'

import { formatINRCompact, formatINR } from '@/lib/utils/currency'
import type { ByPeriodResult } from '@/lib/api/analytics'

const INCOME_COLOUR = '#22c55e'
const EXPENSE_COLOUR = '#ef4444'

interface IncomeExpenseBarChartProps {
  data: ByPeriodResult
  onBarClick?: (label: string, index: number) => void
}

export function IncomeExpenseBarChart({ data, onBarClick }: IncomeExpenseBarChartProps) {
  const rows = data.labels.map((label, i) => ({
    label,
    index: i,
    income: data.income[i] ?? 0,
    expense: data.expense[i] ?? 0,
  }))

  // Average expense across buckets that actually have spend — averaging over
  // every empty day would drag the reference line to near zero.
  const spentBuckets = rows.filter((r) => r.expense > 0)
  const avgExpense =
    spentBuckets.length > 0
      ? spentBuckets.reduce((sum, r) => sum + r.expense, 0) / spentBuckets.length
      : 0

  // Monthly periods have up to 31 buckets — thin the axis so labels stay legible.
  const tickInterval = rows.length > 15 ? Math.floor(rows.length / 10) : 0

  return (
    <motion.div
      data-testid="income-expense-chart"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-56 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            interval={tickInterval}
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
          {avgExpense > 0 && (
            <ReferenceLine
              y={avgExpense}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
            />
          )}
          <Bar
            dataKey="income"
            name="Income"
            fill={INCOME_COLOUR}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
            onClick={(_data, index) => onBarClick?.(rows[index]?.label ?? '', index)}
          />
          <Bar
            dataKey="expense"
            name="Expense"
            fill={EXPENSE_COLOUR}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
            onClick={(_data, index) => onBarClick?.(rows[index]?.label ?? '', index)}
          />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  )
}
