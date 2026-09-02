'use client'

import { Plus } from 'lucide-react'

interface FabProps {
  onClick: () => void
  /** Accessible name, e.g. "Add budget". */
  label: string
}

/**
 * Mobile create button. Sits above the 66px bottom nav; hidden from `md`, where
 * the same action becomes a labelled button in the top bar.
 *
 * It no longer hides on scroll — the design keeps it pinned, and the old
 * scroll-watching behaviour listened to both `window` and the `<main>` element,
 * which double-fired on any page that scrolled its own container.
 */
export function Fab({ onClick, label }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed right-[18px] bottom-[84px] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_24px_-6px_rgba(0,0,0,0.45)] transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
    >
      <Plus className="h-6 w-6" />
    </button>
  )
}
