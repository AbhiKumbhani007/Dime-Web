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
import { buttonVariants } from '@/components/ui/button'
import { useDeleteLedgerPerson } from '@/hooks/useLedger'
import { toastError, toastSuccess } from '@/lib/toast'
import { formatINR } from '@/lib/utils/currency'
import type { LedgerPerson } from '@/lib/api/ledger'

interface DeletePersonDialogProps {
  person?: LedgerPerson
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a successful delete — e.g. to navigate back to the list. */
  onDeleted?: () => void
}

/**
 * The backend always cascade-deletes a person's entries with no force-flag
 * guard, so this copy must surface exactly what's being written off — never
 * a generic "are you sure?".
 */
function describeImpact(person: LedgerPerson): string {
  const totalEntries = person.activeEntryCount + person.settledEntryCount
  const entryPhrase = totalEntries > 0 ? `${totalEntries} ${totalEntries === 1 ? 'entry' : 'entries'}` : ''
  const hasBalance = person.balance !== 0

  if (entryPhrase && hasBalance) {
    return `Deleting ${person.name} will also delete ${entryPhrase} and an outstanding balance of ${formatINR(Math.abs(person.balance))} will be written off — this cannot be undone.`
  }
  if (entryPhrase) {
    return `Deleting ${person.name} will also delete ${entryPhrase} — this cannot be undone.`
  }
  return `Deleting ${person.name} cannot be undone.`
}

export function DeletePersonDialog({ person, open, onOpenChange, onDeleted }: DeletePersonDialogProps) {
  const deletePerson = useDeleteLedgerPerson()

  async function handleDelete() {
    if (!person) return
    try {
      await deletePerson.mutateAsync(person.id)
      toastSuccess('Person deleted')
      onOpenChange(false)
      onDeleted?.()
    } catch {
      toastError('Could not delete person. Please try again.')
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {person?.name}?</AlertDialogTitle>
          <AlertDialogDescription>{person ? describeImpact(person) : ''}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleDelete()
            }}
            className={buttonVariants({ variant: 'destructive' })}
            disabled={deletePerson.isPending}
          >
            {deletePerson.isPending ? 'Deleting…' : 'Delete person'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
