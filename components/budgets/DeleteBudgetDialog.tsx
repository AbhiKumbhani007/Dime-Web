'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteBudget } from '@/hooks/useBudgets'
import { toastError, toastSuccess } from '@/lib/toast'
import type { BudgetWithProgress } from '@/lib/api/budgets'

interface DeleteBudgetDialogProps {
  budget?: BudgetWithProgress
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteBudgetDialog({ budget, open, onOpenChange }: DeleteBudgetDialogProps) {
  const deleteBudget = useDeleteBudget()

  async function handleDelete() {
    if (!budget) return
    try {
      await deleteBudget.mutateAsync(budget.id)
      toastSuccess('Budget deleted')
    } catch {
      toastError('Could not delete budget. Please try again.')
    } finally {
      onOpenChange(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {budget?.name ?? 'budget'}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the budget only. Your transactions are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
