'use client'

import { usePathname } from 'next/navigation'
import { ChevronLeft, Plus } from 'lucide-react'
import { routeTitles } from '@/lib/routeTitles'
import { cn } from '@/lib/utils'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { usePreferencesStore, type Density } from '@/store/usePreferencesStore'

const DENSITY_OPTIONS = [
  { value: 'comfortable' as const, label: 'Comfortable' },
  { value: 'dense' as const, label: 'Dense' },
]

export interface TopBarProps {
  /** Overrides the route-derived title — used for the mobile Ledger detail view. */
  title?: string
  /** Secondary line beside the title, e.g. "1,482 transactions". Hidden on mobile. */
  meta?: string
  /** Renders a back button before the title. Mobile master-detail. */
  onBack?: () => void
  /** The screen's create action. Becomes a labelled button here, a FAB on mobile. */
  primaryAction?: { label: string; onClick: () => void }
  rightAction?: React.ReactNode
}

export function TopBar({ title, meta, onBack, primaryAction, rightAction }: TopBarProps) {
  const pathname = usePathname()
  const density = usePreferencesStore((s) => s.density)
  const setDensity = usePreferencesStore((s) => s.setDensity)

  const resolvedTitle = title ?? routeTitles[pathname] ?? ''

  return (
    <header className="sticky top-0 z-40 flex min-h-[52px] shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-3.5 py-2.5 md:min-h-[60px] md:px-[18px]">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="-ml-2 flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <h1 className="shrink-0 text-base font-bold tracking-[-0.015em] md:text-[17px]">
        {resolvedTitle}
      </h1>

      {meta && <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">{meta}</span>}

      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {/* Density is a tablet/desktop control — mobile is always tight. */}
        <SegmentedControl
          className="hidden md:inline-flex"
          label="Row density"
          options={DENSITY_OPTIONS}
          value={density}
          onChange={(value: Density) => setDensity(value)}
        />

        {primaryAction && (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className={cn(
              'hidden h-[38px] cursor-pointer items-center gap-[7px] rounded-[10px] bg-primary px-3.5',
              'text-[13px] font-semibold text-primary-foreground hover:opacity-90',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:flex',
            )}
          >
            <Plus className="h-4 w-4" />
            {primaryAction.label}
            <span
              aria-hidden
              className="rounded px-1.5 py-px font-mono text-[10px] font-medium text-primary-foreground/80 ring-1 ring-inset ring-primary-foreground/25"
            >
              N
            </span>
          </button>
        )}

        {rightAction}
      </div>
    </header>
  )
}
