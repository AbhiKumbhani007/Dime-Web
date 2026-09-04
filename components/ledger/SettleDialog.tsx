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
import { useSettleLedgerPerson } from '@/hooks/useLedger'
import { toastError, toastSuccess } from '@/lib/toast'
import { formatINR } from '@/lib/utils/currency'
import type { LedgerPerson } from '@/lib/api/ledger'

interface SettleDialogProps {
  person?: LedgerPerson
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettleDialog({ person, open, onOpenChange }: SettleDialogProps) {
  const settlePerson = useSettleLedgerPerson(person?.id ?? '')

  async function handleSettle() {
    if (!person) return
    try {
      await settlePerson.mutateAsync({ expectedBalance: person.balance })
      toastSuccess('Settled — balance is ₹0')
    } catch {
      toastError('Could not settle up. Please try again.')
    } finally {
      onOpenChange(false)
    }
  }

  const firstName = person?.name.split(' ')[0] ?? 'this person'
  const amount = person ? formatINR(Math.abs(person.balance)) : '₹0'

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Settle up with {firstName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every active entry is marked settled and the balance resets to ₹0. Nothing is
            deleted — settled entries stay in the history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSettle}>Settle {amount}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
