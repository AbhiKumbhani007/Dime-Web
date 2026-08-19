import { Skeleton } from '@/components/ui/skeleton'

export function BudgetCardSkeleton() {
  return (
    <div
      data-testid="budget-card-skeleton"
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="mt-3 h-2 w-full rounded-full" />
      <Skeleton className="mt-2 h-4 w-40" />
    </div>
  )
}
