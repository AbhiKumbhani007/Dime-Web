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
import { useDeleteLedgerEntry } from '@/hooks/useLedger'
import { toastError, toastSuccess } from '@/lib/toast'
import { formatINR } from '@/lib/utils/currency'
import { ENTRY_TYPE_META } from '@/lib/utils/ledger'
import type { LedgerEntry } from '@/lib/api/ledger'

interface DeleteEntryDialogProps {
  entry?: LedgerEntry
  personId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteEntryDialog({ entry, personId, open, onOpenChange }: DeleteEntryDialogProps) {
  const deleteEntry = useDeleteLedgerEntry(personId)

  async function handleDelete() {
    if (!entry) return
    try {
      await deleteEntry.mutateAsync(entry.id)
      toastSuccess('Entry deleted')
    } catch {
      toastError('Could not delete entry. Please try again.')
    } finally {
      onOpenChange(false)
    }
  }

  const label = entry ? entry.note || ENTRY_TYPE_META[entry.type].label : ''
  const amount = entry ? formatINR(entry.amount) : ''

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
          <AlertDialogDescription>
            {label} · {amount}. The balance recalculates without it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Delete entry</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
