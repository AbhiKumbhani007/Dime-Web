'use client'

import { useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatINR } from '@/lib/utils/currency'
import {
  budgetHealth,
  clampPercent,
  HEALTH_BAR_CLASS,
  HEALTH_TEXT_CLASS,
} from '@/lib/utils/budgetProgress'
import { BUDGET_PERIODS, type BudgetWithProgress } from '@/lib/api/budgets'

const LONG_PRESS_MS = 500

interface BudgetCardProps {
  budget: BudgetWithProgress
  onEdit: (budget: BudgetWithProgress) => void
  onDelete: (budget: BudgetWithProgress) => void
}

export function BudgetCard({ budget, onEdit, onDelete }: BudgetCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const health = budgetHealth(budget.percent)
  const barWidth = clampPercent(budget.percent)
  const periodLabel =
    BUDGET_PERIODS.find((p) => p.value === budget.type)?.label ?? budget.type

  function startLongPress() {
    timer.current = setTimeout(() => setMenuOpen(true), LONG_PRESS_MS)
  }

  function cancelLongPress() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  return (
    <div
      data-testid="budget-card"
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--card-foreground)]"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ backgroundColor: `${budget.colour}22` }}
        >
          {budget.emoji}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{budget.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {budget.category && (
              <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                {budget.category.emoji} {budget.category.name}
              </span>
            )}
            <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
              {periodLabel}
            </span>
          </div>
        </div>

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Options for ${budget.name}`}
              className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(budget)}>Edit</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onDelete(budget)}
              className="text-[var(--destructive)]"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]"
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
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
        <span>
          <span className={`font-semibold ${HEALTH_TEXT_CLASS[health]}`}>
            {formatINR(budget.spent)}
          </span>
          <span className="text-[var(--muted-foreground)]"> / {formatINR(budget.amount)}</span>
        </span>
        <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
          {budget.daysRemaining} {budget.daysRemaining === 1 ? 'day' : 'days'} left
        </span>
      </div>

      {budget.remaining < 0 && (
        <p className="mt-1 text-xs font-medium text-[var(--destructive)]">
          Over by {formatINR(Math.abs(budget.remaining))}
        </p>
      )}
    </div>
  )
}
