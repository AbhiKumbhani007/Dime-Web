import { ArrowUp, ArrowDownLeft, type LucideIcon } from 'lucide-react'
import type { LedgerDirection, LedgerEntryType, LedgerPerson } from '@/lib/api/ledger'

interface EntryTypeMeta {
  label: string
  icon: LucideIcon
  tone: string
  sign: '+' | '−'
}

/** GAVE = handed money over, their debt goes up. RECEIVED = paid back, debt goes down. */
export const ENTRY_TYPE_META: Record<LedgerEntryType, EntryTypeMeta> = {
  GAVE: { label: 'You gave', icon: ArrowUp, tone: 'var(--income)', sign: '+' },
  RECEIVED: { label: 'You received', icon: ArrowDownLeft, tone: 'var(--expense)', sign: '−' },
}

interface DirectionMeta {
  /** Short form for the list-row sub-label. */
  shortLabel: string
  /** Full sentence for the detail-header direction line. */
  longLabel: string
  tone: string
  chipBg: string
}

/**
 * Server-derived direction → display metadata. The server owns balance/direction
 * derivation entirely — this is a lookup table, never a recomputation from `balance`.
 */
export const DIRECTION_META: Record<LedgerDirection, DirectionMeta> = {
  OWED_TO_YOU: {
    shortLabel: 'owes you',
    longLabel: 'owes you',
    tone: 'var(--income)',
    chipBg: 'color-mix(in srgb, var(--income) 16%, transparent)',
  },
  YOU_OWE: {
    shortLabel: 'you owe',
    longLabel: 'you owe',
    tone: 'var(--expense)',
    chipBg: 'color-mix(in srgb, var(--expense) 16%, transparent)',
  },
  SETTLED: {
    shortLabel: 'all square',
    longLabel: 'settled — nothing outstanding',
    tone: 'var(--muted-foreground)',
    chipBg: 'var(--muted)',
  },
}

export function directionMeta(direction: LedgerDirection): DirectionMeta {
  return DIRECTION_META[direction]
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** e.g. "3 entries · last 12 Aug", "4 entries · settled 1 Aug", "No entries yet". */
export function personSubLine(
  person: Pick<LedgerPerson, 'activeEntryCount' | 'settledEntryCount' | 'lastActivityAt' | 'direction'>,
): string {
  const total = person.activeEntryCount + person.settledEntryCount
  if (total === 0) return 'No entries yet'

  const countLabel = `${total} ${total === 1 ? 'entry' : 'entries'}`
  if (!person.lastActivityAt) return countLabel

  const verb = person.direction === 'SETTLED' ? 'settled' : 'last'
  return `${countLabel} · ${verb} ${shortDate(person.lastActivityAt)}`
}
