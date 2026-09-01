import { cn } from '@/lib/utils'

interface PanelProps {
  title: string
  /** Right-hand slot on the title row — a legend, a toggle, or a caption. */
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * A titled card on the Insights grid.
 *
 * Insights used to hide its advanced charts behind accordions; the design shows
 * every panel at once ("no accordions"), so this is deliberately not
 * collapsible. min-w-0 matters — these sit in grid tracks, and a chart that
 * reports an intrinsic width would otherwise stretch its column.
 */
export function Panel({ title, aside, children, className }: PanelProps) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-border bg-card p-(--pad-card)',
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2.5 pb-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

interface LegendProps {
  items: Array<{ label: string; colour: string; dashed?: boolean }>
}

export function PanelLegend({ items }: LegendProps) {
  return (
    <span className="flex flex-wrap gap-3">
      {items.map(({ label, colour, dashed }) => (
        <span
          key={label}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          {dashed ? (
            <span
              aria-hidden
              className="block w-3.5 border-t border-dashed"
              style={{ borderColor: colour }}
            />
          ) : (
            <span
              aria-hidden
              className="block h-2 w-2 rounded-[3px]"
              style={{ background: colour }}
            />
          )}
          {label}
        </span>
      ))}
    </span>
  )
}
