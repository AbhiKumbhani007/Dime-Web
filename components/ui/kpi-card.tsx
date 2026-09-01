import { cn } from '@/lib/utils'

export interface KpiCardProps {
  label: string
  /** Pre-formatted for display — pass `formatINR(n)`, not a raw number. */
  value: string
  /** Supporting line under the value, e.g. "44 transactions". */
  sub?: string
  /**
   * Semantic colour for the value and the left rail. Any CSS colour; in
   * practice one of `var(--income)`, `var(--expense)` or `var(--foreground)`.
   */
  tone?: string
  className?: string
}

/**
 * The stat tile used across Log, Insights, Ledger and the CSV import preview.
 * A 3px full-height rail on the left carries the semantic colour; the number
 * is mono so a row of them aligns down the column.
 */
export function KpiCard({ label, value, sub, tone = 'var(--foreground)', className }: KpiCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-1 overflow-hidden rounded-[14px] border border-border bg-card p-(--pad-card)',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tone }} />
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="font-mono text-xl font-bold tracking-[-0.025em]" style={{ color: tone }}>
        {value}
      </span>
      {sub && <span className="text-[10.5px] text-muted-foreground">{sub}</span>}
    </div>
  )
}
