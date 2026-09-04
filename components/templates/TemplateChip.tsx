'use client'

import { EmojiTile } from '@/components/ui/emoji-tile'
import { formatINR } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import type { Template } from '@/lib/api/templates'

/** Neutral wash used when a template has no category to borrow a colour from. */
const DEFAULT_COLOUR = '#6b7280'

interface TemplateChipProps {
  template: Template
  selected?: boolean
  onClick?: () => void
}

/** A single tappable template chip: emoji tile, label, and amount (when set). */
export function TemplateChip({ template, selected, onClick }: TemplateChipProps) {
  const colour = template.category?.color ?? DEFAULT_COLOUR

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
        selected
          ? 'border-[var(--foreground)] bg-[var(--accent)]'
          : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]',
      )}
    >
      <EmojiTile emoji={template.emoji} colour={colour} shape="square" size="sm" />
      <span className="font-medium text-[var(--foreground)]">{template.label}</span>
      {template.amount !== null && (
        <span className="text-[var(--muted-foreground)]">{formatINR(template.amount)}</span>
      )}
    </button>
  )
}
