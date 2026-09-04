import { Skeleton } from '@/components/ui/skeleton'

export function PersonDetailSkeleton() {
  return (
    <div data-testid="ledger-detail-skeleton" className="flex flex-col gap-(--gap)">
      <Skeleton className="h-[104px] w-full rounded-2xl" />
      <Skeleton className="h-3.5 w-28" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full rounded-xl opacity-90" />
        <Skeleton className="h-12 w-full rounded-xl opacity-80" />
        <Skeleton className="h-12 w-full rounded-xl opacity-70" />
      </div>
    </div>
  )
}
