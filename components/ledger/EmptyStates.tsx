import { Handshake, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LedgerEmptyStateProps {
  onAdd: () => void
}

/** Zero people. The mockup also shows a decorative "Import from contacts"
 * button — there's no backend behind it, so it's omitted here rather than
 * built as a dead affordance. */
export function LedgerEmptyState({ onAdd }: LedgerEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 py-20 text-center">
      <Handshake className="h-12 w-12 text-muted-foreground opacity-45" aria-hidden="true" />
      <h2 className="text-xl font-bold tracking-[-0.02em]">Nobody owes anybody yet</h2>
      <p className="max-w-sm text-sm text-muted-foreground text-pretty">
        The ledger tracks informal debts — the dinner you covered, the deposit you fronted. Add a
        person and record what moved.
      </p>
      <Button type="button" onClick={onAdd} className="mt-1.5">
        Add your first person
      </Button>
    </div>
  )
}

interface AllSquareStateProps {
  firstName: string
}

/** Zero active entries for the selected person. */
export function AllSquareState({ firstName }: AllSquareStateProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-9 text-center">
      <CheckCircle2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <span className="text-[13.5px] font-semibold">All square with {firstName}</span>
      <span className="text-xs text-muted-foreground">Nothing outstanding.</span>
    </div>
  )
}
