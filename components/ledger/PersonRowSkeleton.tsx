import { Skeleton } from '@/components/ui/skeleton'

export function PersonRowSkeleton() {
  return (
    <div
      data-testid="ledger-person-row-skeleton"
      className="flex items-center gap-3 rounded-[13px] border border-border p-(--pad-card)"
    >
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-2.5 w-32" />
      </div>
      <Skeleton className="h-[22px] w-16 shrink-0 rounded-full" />
    </div>
  )
}
