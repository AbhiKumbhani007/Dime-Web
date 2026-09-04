import { MoreVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatINR } from '@/lib/utils/currency'
import { directionMeta } from '@/lib/utils/ledger'
import { PersonAvatar } from '@/components/ledger/PersonAvatar'
import type { LedgerPerson } from '@/lib/api/ledger'

interface PersonDetailHeaderProps {
  person: LedgerPerson
  onAddEntry: () => void
  onSettle: () => void
  onEdit: () => void
  onDelete: () => void
  /** Desktop-only "×" that clears the selection back to list-only. */
  onClose?: () => void
}

export function PersonDetailHeader({
  person,
  onAddEntry,
  onSettle,
  onEdit,
  onDelete,
  onClose,
}: PersonDetailHeaderProps) {
  const meta = directionMeta(person.direction)
  const settled = person.direction === 'SETTLED'

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-(--pad-card)">
      <PersonAvatar name={person.name} color={person.color} size="lg" />

      <div className="flex min-w-[170px] flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-[19px] font-bold tracking-[-0.02em]">{person.name}</span>
          {person.note && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {person.note}
            </span>
          )}
        </div>
        <span className="text-[11.5px] text-muted-foreground">{meta.longLabel}</span>
        <span className="font-mono text-[28px] font-bold tracking-[-0.03em]" style={{ color: meta.tone }}>
          {formatINR(Math.abs(person.balance))}
        </span>
      </div>

      <div className="ml-auto flex flex-1 flex-wrap justify-end gap-2 sm:flex-none">
        <Button type="button" variant="outline" onClick={onAddEntry} className="flex-1 sm:flex-none">
          <Plus className="h-4 w-4" />
          Add entry
        </Button>
        <Button type="button" onClick={onSettle} disabled={settled} className="flex-1 sm:flex-none">
          Settle up
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label="Person options" className="shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Edit person
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete person
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onClose && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClose}
            aria-label="Close panel"
            title="Close — Esc"
            className="hidden shrink-0 lg:inline-flex"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
