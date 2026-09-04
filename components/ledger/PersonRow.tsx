import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/utils/currency'
import { directionMeta, personSubLine } from '@/lib/utils/ledger'
import { PersonAvatar } from '@/components/ledger/PersonAvatar'
import type { LedgerPerson } from '@/lib/api/ledger'

interface PersonRowProps {
  person: LedgerPerson
  selected: boolean
  onSelect: (id: string) => void
}

export function PersonRow({ person, selected, onSelect }: PersonRowProps) {
  const meta = directionMeta(person.direction)
  const chipLabel = person.direction === 'SETTLED' ? 'Settled' : formatINR(Math.abs(person.balance))

  return (
    <button
      type="button"
      data-testid="ledger-person-row"
      onClick={() => onSelect(person.id)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative flex w-full items-center gap-3 overflow-hidden rounded-[13px] border p-(--pad-card) text-left transition-colors',
        'hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        selected ? 'border-accent bg-muted' : 'border-border bg-card',
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: selected ? 'var(--accent)' : 'transparent' }}
      />

      <PersonAvatar name={person.name} color={person.color} />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('truncate text-sm', selected ? 'font-semibold' : 'font-medium')}>
          {person.name}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">{personSubLine(person)}</span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-[3px]">
        <span
          className="rounded-full px-2 py-[3px] font-mono text-[12.5px] font-semibold whitespace-nowrap"
          style={{ background: meta.chipBg, color: meta.tone }}
        >
          {chipLabel}
        </span>
        <span className="text-[9.5px] text-muted-foreground whitespace-nowrap">{meta.shortLabel}</span>
      </span>
    </button>
  )
}
