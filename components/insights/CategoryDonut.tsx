'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { formatINR } from '@/lib/utils/currency'
import type { CategoryBreakdownRow } from '@/lib/api/analytics'

const FALLBACK_COLOUR = '#6b7280'

interface CategoryDonutProps {
  rows: CategoryBreakdownRow[]
}

export function CategoryDonut({ rows }: CategoryDonutProps) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="category-donut-empty"
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted-foreground)]"
      >
        No spending in this period.
      </div>
    )
  }

  const data = rows.map((r) => ({
    name: r.category?.name ?? 'Uncategorised',
    emoji: r.category?.emoji ?? '',
    value: r.total,
    percent: r.percent,
    colour: r.category?.color ?? FALLBACK_COLOUR,
  }))

  return (
    <div
      data-testid="category-donut"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3"
    >
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.colour} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [formatINR(Number(value)), String(name)]}
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 space-y-1">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.colour }}
            />
            <span className="min-w-0 flex-1 truncate">
              {entry.emoji} {entry.name}
            </span>
            <span className="shrink-0 text-[var(--muted-foreground)]">
              {entry.percent}%
            </span>
            <span className="shrink-0 font-medium">{formatINR(entry.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
