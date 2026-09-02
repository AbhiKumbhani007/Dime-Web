'use client'

import { useCallback, useMemo, useState } from 'react'
import { PiggyBank, Plus } from 'lucide-react'

import { BudgetCard } from '@/components/budgets/BudgetCard'
import { BudgetCardSkeleton } from '@/components/budgets/BudgetCardSkeleton'
import { BudgetDonutSummary } from '@/components/budgets/BudgetDonutSummary'
import { BudgetForm } from '@/components/budgets/BudgetForm'
import { DeleteBudgetDialog } from '@/components/budgets/DeleteBudgetDialog'
import { useBudgets } from '@/hooks/useBudgets'
import { usePageChrome } from '@/components/layout/PageChrome'
import type { BudgetWithProgress } from '@/lib/api/budgets'

export default function BudgetsPage() {
  const { data, isLoading, isError } = useBudgets()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BudgetWithProgress | undefined>(undefined)
  const [deleting, setDeleting] = useState<BudgetWithProgress | undefined>(undefined)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const budgets = data?.budgets ?? []

  const handleAdd = useCallback(() => {
    setEditing(undefined)
    setFormOpen(true)
  }, [])

  // One declaration drives the top-bar button (md+), the FAB (mobile) and `n`.
  usePageChrome(
    useMemo(() => ({ primaryAction: { label: 'Add budget', onClick: handleAdd } }), [handleAdd]),
  )

  function handleEdit(budget: BudgetWithProgress) {
    setEditing(budget)
    setFormOpen(true)
  }

  function handleDelete(budget: BudgetWithProgress) {
    setDeleting(budget)
    setDeleteOpen(true)
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-(--gap) p-(--pad-page)">
      {isLoading && (
        <div className="grid gap-(--gap) md:grid-cols-2 lg:grid-cols-3">
          <BudgetCardSkeleton />
          <BudgetCardSkeleton />
          <BudgetCardSkeleton />
        </div>
      )}

      {isError && (
        <p className="py-10 text-center text-sm text-destructive">
          Could not load budgets. Pull down to retry.
        </p>
      )}

      {!isLoading && !isError && budgets.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
          <PiggyBank className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">No budgets yet</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            Set a spending limit on a category and track it against what you actually spend.
          </p>
        </div>
      )}

      {!isLoading && !isError && budgets.length > 0 && (
        <>
          <BudgetDonutSummary budgets={budgets} />
          <div className="grid min-w-0 gap-(--gap) md:grid-cols-2 lg:grid-cols-3">
            {budgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}

            {/* The design closes the grid with a dashed tile rather than
                relying on the top-bar button alone, so the affordance sits
                where the eye already is after scanning the cards. */}
            <button
              type="button"
              onClick={handleAdd}
              className="flex min-h-[168px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus aria-hidden className="h-6 w-6" />
              <span className="text-[13px] font-medium">New budget</span>
            </button>
          </div>
        </>
      )}


      <BudgetForm open={formOpen} onOpenChange={setFormOpen} budget={editing} />
      <DeleteBudgetDialog budget={deleting} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  )
}
