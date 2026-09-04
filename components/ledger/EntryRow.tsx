import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/utils/currency'
import { formatDateShort } from '@/lib/utils/date'
import { ENTRY_TYPE_META } from '@/lib/utils/ledger'
import type { LedgerEntry } from '@/lib/api/ledger'

interface EntryRowProps {
  entry: LedgerEntry
  variant: 'active' | 'settled'
  onEdit?: (entry: LedgerEntry) => void
  onDelete?: (entry: LedgerEntry) => void
}

/** One row of an entries list. Settled rows are read-only in the UI even
 * though the API allows un-settling one via PATCH — no edit/delete here. */
export function EntryRow({ entry, variant, onEdit, onDelete }: EntryRowProps) {
  const meta = ENTRY_TYPE_META[entry.type]
  const isActive = variant === 'active'
  const dateLabel = formatDateShort(entry.date)
  const label = entry.note || meta.label

  return (
    <div
      data-testid="ledger-entry-row"
      className={cn(
        'flex min-h-(--row-h) items-center gap-3 border-b border-border px-4',
        !isActive && 'opacity-[0.62]',
      )}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{
          color: isActive ? meta.tone : 'var(--muted-foreground)',
          background: isActive ? `color-mix(in srgb, ${meta.tone} 14%, transparent)` : 'var(--muted)',
        }}
      >
        <meta.icon className="h-4 w-4" />
      </span>

      <span className="hidden w-[104px] shrink-0 text-xs font-semibold md:block" style={{ color: isActive ? meta.tone : 'var(--muted-foreground)' }}>
        {meta.label}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            'truncate text-[13px]',
            !isActive && 'text-muted-foreground line-through',
          )}
        >
          {label}
        </span>
        <span className="truncate text-[10.5px] font-medium md:hidden" style={{ color: isActive ? meta.tone : 'var(--muted-foreground)' }}>
          {meta.label} · {dateLabel}
        </span>
      </span>

      <span className="hidden w-[84px] shrink-0 font-mono text-[11.5px] text-muted-foreground md:block">
        {dateLabel}
      </span>

      <span
        className="w-[110px] shrink-0 text-right font-mono text-sm font-semibold whitespace-nowrap"
        style={{ color: isActive ? meta.tone : 'var(--muted-foreground)' }}
      >
        {meta.sign}
        {formatINR(entry.amount)}
      </span>

      {isActive && (
        <span className="flex shrink-0 gap-0.5">
          <button
            type="button"
            aria-label={`Edit entry: ${label}`}
            onClick={() => onEdit?.(entry)}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Delete entry: ${label}`}
            onClick={() => onDelete?.(entry)}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  )
}
