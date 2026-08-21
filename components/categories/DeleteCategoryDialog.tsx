'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useDeleteCategory } from '@/hooks/useCategories'
import type { Category } from '@/lib/api/categories'

interface DeleteCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
  onConfirm?: () => void
}

export function DeleteCategoryDialog({
  open,
  onOpenChange,
  category,
  onConfirm,
}: DeleteCategoryDialogProps) {
  const deleteCategory = useDeleteCategory()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!category) return
    setError(null)
    try {
      await deleteCategory.mutateAsync(category.id)
      onConfirm?.()
      onOpenChange(false)
    } catch (err: unknown) {
      const anyErr = err as { response?: { status?: number } }
      if (anyErr?.response?.status === 409) {
        setError('This category is used by transactions and cannot be deleted')
      } else {
        setError('Failed to delete category. Please try again.')
      }
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) setError(null)
      onOpenChange(isOpen)
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Category</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &apos;{category?.name}&apos;? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p className="text-sm text-[var(--destructive)] px-1">{error}</p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleDelete()
            }}
            className="bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90"
            disabled={deleteCategory.isPending}
          >
            {deleteCategory.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
