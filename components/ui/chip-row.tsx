import { cn } from '@/lib/utils'

interface ChipRowProps {
  children: React.ReactNode
  /** Accessible name, e.g. "Filter by category". Omit inside a labelled group. */
  label?: string
  role?: 'radiogroup' | 'group'
  className?: string
}

/**
 * Horizontally scrolling row of chips.
 *
 * The nesting here is load-bearing and is the whole reason this component
 * exists. A `w-max` child inside a flex column propagates its intrinsic width
 * all the way up and makes the entire page scroll sideways — a bug that has
 * shipped twice (see the DECISIONS LOG in process.txt, and the
 * `scrollWidth <= clientWidth` guard in e2e/insights.spec.ts).
 *
 * `min-w-0` on the scroll container is what stops that propagation; the inner
 * `w-max` is what lets the chips overflow *within* it. Route every chip row
 * through here rather than rebuilding the pair by hand.
 */
export function ChipRow({ children, label, role, className }: ChipRowProps) {
  return (
    <div className={cn('scrollbar-hide w-full min-w-0 overflow-x-auto', className)}>
      <div role={role} aria-label={label} className="flex w-max gap-1.5 pb-0.5">
        {children}
      </div>
    </div>
  )
}
