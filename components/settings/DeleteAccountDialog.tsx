'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Input } from '@/components/ui/input'
import { deleteAccount } from '@/lib/api/auth'
import { useAuthStore } from '@/store/useAuthStore'
import { toastError } from '@/lib/toast'

const CONFIRM_TEXT = 'DELETE'

interface DeleteAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Danger-zone confirmation for permanent account deletion. Shaped after
 * DeleteCategoryDialog (AlertDialog + destructive action with a
 * pending-label swap), plus a type-to-confirm text input since deleting an
 * entire account is far more destructive than deleting one category.
 */
export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const canDelete = confirmText === CONFIRM_TEXT

  async function handleDelete() {
    if (!canDelete) return
    setDeleting(true)
    try {
      await deleteAccount()
      useAuthStore.getState().clearAuth()
      router.replace('/login')
    } catch {
      toastError('Could not delete account. Please try again.')
      setDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) setConfirmText('')
        onOpenChange(isOpen)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete account</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your account and all associated data — transactions,
            budgets, categories, ledger entries. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5 px-1">
          <label htmlFor="delete-account-confirm" className="text-xs text-muted-foreground">
            Type <span className="font-semibold text-foreground">DELETE</span> to confirm
          </label>
          <Input
            id="delete-account-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            disabled={deleting}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleDelete()
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!canDelete || deleting}
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
