'use client'

import { Pencil, Trash2 } from 'lucide-react'

import { EmojiTile } from '@/components/ui/emoji-tile'
import { formatINR } from '@/lib/utils/currency'
import {
  budgetHealth,
  clampPercent,
  HEALTH_BAR_CLASS,
  HEALTH_TEXT_CLASS,
} from '@/lib/utils/budgetProgress'
import { spendingVelocity } from '@/lib/utils/spendingVelocity'
import { BUDGET_PERIODS, type BudgetWithProgress } from '@/lib/api/budgets'

const HEALTH_RAIL: Record<ReturnType<typeof budgetHealth>, string> = {
  safe: 'var(--income)',
  warning: 'var(--warning-fill)',
  danger: 'var(--expense)',
}

/**
 * Pace is a different question from health: health asks "how much of the limit
 * is gone", pace asks "is that too much for how far into the period we are".
 * A budget can be 12% spent (healthy green) and still be running hot, so the
 * verdict is coloured by pace — showing "Over pace" in green read as a
 * contradiction.
 */
const PACE = {
  over: { label: 'Over pace', className: 'text-expense' },
  'on-track': { label: 'On track', className: 'text-muted-foreground' },
  under: { label: 'Under pace', className: 'text-income' },
} as const

interface BudgetCardProps {
  budget: BudgetWithProgress
  onEdit: (budget: BudgetWithProgress) => void
  onDelete: (budget: BudgetWithProgress) => void
}

export function BudgetCard({ budget, onEdit, onDelete }: BudgetCardProps) {
  const health = budgetHealth(budget.percent)
  const barWidth = clampPercent(budget.percent)
  const velocity = spendingVelocity(budget)
  const periodLabel =
    BUDGET_PERIODS.find((p) => p.value === budget.type)?.label ?? budget.type

  return (
    <div
      data-testid="budget-card"
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-(--pad-card) transition-colors hover:border-accent"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: HEALTH_RAIL[health] }}
      />

      <div className="flex items-start gap-3">
        <EmojiTile emoji={budget.emoji} colour={budget.colour} shape="square" size="lg" />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-semibold">{budget.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {budget.category && (
              <span className="rounded-full bg-muted px-[7px] py-0.5 text-[10px] font-medium text-muted-foreground">
                {budget.category.emoji} {budget.category.name}
              </span>
            )}
            <span className="rounded-full bg-muted px-[7px] py-0.5 text-[10px] font-medium text-muted-foreground">
              {periodLabel}
            </span>
          </div>
        </div>

        {/* Always visible rather than hover-revealed: budget cards are a
            primary touch target on mobile, where there is no hover. */}
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            aria-label={`Edit ${budget.name}`}
            onClick={() => onEdit(budget)}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${budget.name}`}
            onClick={() => onDelete(budget)}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(barWidth)}
          aria-label={`${budget.name} spend`}
        >
          <div
            data-testid="budget-progress-bar"
            className={`h-full rounded-full transition-all ${HEALTH_BAR_CLASS[health]}`}
            style={{ width: `${barWidth}%` }}
          />
          {/* Pace marker: where spending *should* be by now. Its distance from
              the bar's end is the whole point of the card at a glance. */}
          {velocity && (
            <span
              aria-hidden
              className="absolute -top-0.5 -bottom-0.5 w-[1.5px] bg-foreground opacity-45"
              style={{ left: `${clampPercent(velocity.elapsedPercent)}%` }}
            />
          )}
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[13px] font-semibold">
            {formatINR(budget.spent)}
            <span className="font-normal text-muted-foreground"> / {formatINR(budget.amount)}</span>
          </span>
          <span className={`shrink-0 font-mono text-[11.5px] font-medium ${HEALTH_TEXT_CLASS[health]}`}>
            {Math.round(budget.percent)}%
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {budget.daysRemaining} {budget.daysRemaining === 1 ? 'day' : 'days'} left
        </span>
        {velocity && (
          <span className={`shrink-0 text-[11.5px] font-semibold ${PACE[velocity.status].className}`}>
            {PACE[velocity.status].label}
          </span>
        )}
      </div>

      {budget.remaining < 0 && (
        <p className="text-[11px] font-medium text-destructive">
          Over by {formatINR(Math.abs(budget.remaining))}
        </p>
      )}
    </div>
  )
}
