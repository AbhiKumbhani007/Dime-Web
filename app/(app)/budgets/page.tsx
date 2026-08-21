'use client'

import { useState } from 'react'
import { PiggyBank } from 'lucide-react'

import { Fab } from '@/components/layout/Fab'
import { BudgetCard } from '@/components/budgets/BudgetCard'
import { BudgetCardSkeleton } from '@/components/budgets/BudgetCardSkeleton'
import { BudgetDonutSummary } from '@/components/budgets/BudgetDonutSummary'
import { BudgetForm } from '@/components/budgets/BudgetForm'
import { DeleteBudgetDialog } from '@/components/budgets/DeleteBudgetDialog'
import { useBudgets } from '@/hooks/useBudgets'
import type { BudgetWithProgress } from '@/lib/api/budgets'

export default function BudgetsPage() {
  const { data, isLoading, isError } = useBudgets()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BudgetWithProgress | undefined>(undefined)
  const [deleting, setDeleting] = useState<BudgetWithProgress | undefined>(undefined)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const budgets = data?.budgets ?? []

  function handleAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function handleEdit(budget: BudgetWithProgress) {
    setEditing(budget)
    setFormOpen(true)
  }

  function handleDelete(budget: BudgetWithProgress) {
    setDeleting(budget)
    setDeleteOpen(true)
  }

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 pb-24">
      {isLoading && (
        <>
          <BudgetCardSkeleton />
          <BudgetCardSkeleton />
          <BudgetCardSkeleton />
        </>
      )}

      {isError && (
        <p className="py-10 text-center text-sm text-[var(--destructive)]">
          Could not load budgets. Pull down to retry.
        </p>
      )}

      {!isLoading && !isError && budgets.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
          <PiggyBank className="h-12 w-12 text-[var(--muted-foreground)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold">No budgets yet</h2>
          <p className="max-w-xs text-sm text-[var(--muted-foreground)]">
            Set a spending limit on a category and track it against what you actually spend.
          </p>
        </div>
      )}

      {!isLoading && !isError && budgets.length > 0 && (
        <>
          <BudgetDonutSummary budgets={budgets} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {budgets.map((budget) => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}

      <Fab onClick={handleAdd} label="Add budget" />

      <BudgetForm open={formOpen} onOpenChange={setFormOpen} budget={editing} />
      <DeleteBudgetDialog budget={deleting} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  )
}
