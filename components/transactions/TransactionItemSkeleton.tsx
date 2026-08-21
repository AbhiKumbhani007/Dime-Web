import { Skeleton } from '@/components/ui/skeleton'

/** A placeholder row that mimics the layout of TransactionItem. */
export function TransactionItemSkeleton() {
  return (
    <div
      data-testid="transaction-skeleton"
      className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]"
    >
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  )
}
