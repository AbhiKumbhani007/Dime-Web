'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatINR, formatINRCompact } from '@/lib/utils/currency'
import type { TrendRow } from '@/lib/api/analytics'

const INCOME_COLOUR = '#22c55e'
const EXPENSE_COLOUR = '#ef4444'
const NET_COLOUR = '#6366f1'

/** "2026-08" → "Aug 26" for a compact axis. */
function shortMonth(month: string): string {
  const [year, m] = month.split('-')
  const label = new Date(Number(year), Number(m) - 1, 1).toLocaleString('en-US', {
    month: 'short',
  })
  return `${label} ${year.slice(2)}`
}

const axisTick = { fontSize: 10, fill: 'var(--muted-foreground)' }
const tooltipStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
}

export function TrendsChart({ trends }: { trends: TrendRow[] }) {
  const rows = trends.map((t) => ({ ...t, label: shortMonth(t.month) }))

  return (
    <div data-testid="trends-chart" className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            tick={axisTick}
            tickFormatter={(v: number) => formatINRCompact(v)}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            formatter={(value, name) => [formatINR(Number(value)), String(name)]}
            contentStyle={tooltipStyle}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="income"
            name="Income"
            stroke={INCOME_COLOUR}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="expense"
            name="Expense"
            stroke={EXPENSE_COLOUR}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Cumulative net across the trend window. */
export function NetCashflowChart({ trends }: { trends: TrendRow[] }) {
  let running = 0
  const rows = trends.map((t) => {
    running += t.net
    return { label: shortMonth(t.month), cumulative: Math.round(running * 100) / 100 }
  })

  return (
    <div data-testid="net-cashflow-chart" className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            tick={axisTick}
            tickFormatter={(v: number) => formatINRCompact(v)}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            formatter={(value) => [formatINR(Number(value)), 'Cumulative net']}
            contentStyle={tooltipStyle}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke={NET_COLOUR}
            fill={NET_COLOUR}
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
