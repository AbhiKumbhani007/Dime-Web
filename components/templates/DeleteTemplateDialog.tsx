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
import { useDeleteTemplate } from '@/hooks/useTemplates'
import { toastSuccess } from '@/lib/toast'
import type { Template } from '@/lib/api/templates'

interface DeleteTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: Template | null
  onConfirm?: () => void
}

export function DeleteTemplateDialog({
  open,
  onOpenChange,
  template,
  onConfirm,
}: DeleteTemplateDialogProps) {
  const deleteTemplate = useDeleteTemplate()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!template) return
    setError(null)
    try {
      await deleteTemplate.mutateAsync(template.id)
      toastSuccess('Template deleted')
      onConfirm?.()
      onOpenChange(false)
    } catch {
      setError('Failed to delete template. Please try again.')
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) setError(null)
        onOpenChange(isOpen)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Template</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &apos;{template?.label}&apos;? This action cannot be undone.
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
            disabled={deleteTemplate.isPending}
          >
            {deleteTemplate.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
