'use client'

import { useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useDrag } from '@use-gesture/react'
import { Pencil, Trash2 } from 'lucide-react'
import { formatINR } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/date'
import { EmojiTile } from '@/components/ui/emoji-tile'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/lib/api/transactions'
import type { Category } from '@/lib/api/categories'

interface TransactionItemProps {
  transaction: Transaction
  category?: Category
  onDelete?: (tx: Transaction) => void
  onEdit?: (tx: Transaction) => void
}

const SWIPE_THRESHOLD = 80

/**
 * One row of the transaction table.
 *
 * From `md` up it is a five-column row with hover edit/delete buttons. Below
 * that the time, category and action columns are dropped and the time and
 * category fold into a subline under the note, leaving swipe-to-delete as the
 * only way to remove a row on a phone — which is why the gesture stays.
 */
export function TransactionItem({
  transaction,
  category,
  onDelete,
  onEdit,
}: TransactionItemProps) {
  const x = useMotionValue(0)
  const [dragging, setDragging] = useState(false)

  // Red delete background opacity scales with distance
  const bgOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0])

  const bind = useDrag(
    ({ down, movement: [mx], velocity: [vx], direction: [dx], last }) => {
      setDragging(down)
      if (down) {
        // Only allow leftwards drag
        x.set(Math.min(0, mx))
        return
      }
      if (last) {
        const shouldDelete = mx < -SWIPE_THRESHOLD || (vx > 0.5 && dx < 0)
        if (shouldDelete && onDelete) {
          animate(x, -400, { duration: 0.18, onComplete: () => onDelete(transaction) })
        } else {
          // Spring back
          animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 })
        }
      }
    },
    { axis: 'x', filterTaps: true, pointer: { capture: false } },
  )

  function handleOpen() {
    if (!dragging && onEdit) onEdit(transaction)
  }

  const emoji = category?.emoji ?? '💸'
  const colour = category?.color ?? '#6b7280'
  const label = transaction.note?.trim() || category?.name || 'Transaction'
  const time = formatTime(transaction.date)

  return (
    <div className="relative overflow-hidden select-none">
      {/* Swipe-to-delete backdrop. pointer-events-none is load-bearing: it
          otherwise sits over the row and swallows the click that opens it. */}
      <motion.div
        className="pointer-events-none absolute inset-0 flex items-center justify-end bg-destructive pr-6 text-destructive-foreground"
        style={{ opacity: bgOpacity }}
        aria-hidden
      >
        <Trash2 className="h-5 w-5" />
      </motion.div>

      <motion.div
        {...(bind() as React.ComponentProps<typeof motion.div>)}
        data-testid={`transaction-${transaction.id}`}
        style={{ x, touchAction: 'pan-y' }}
        onClick={handleOpen}
        className="group flex min-h-[var(--row-h)] cursor-pointer items-center gap-3.5 border-b border-border bg-card px-4 hover:bg-muted md:gap-3.5"
      >
        <span className="hidden w-[74px] shrink-0 font-mono text-[11.5px] text-muted-foreground md:block">
          {time}
        </span>

        <EmojiTile emoji={emoji} colour={colour} shape="round" size="md" />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13.5px] font-medium">{label}</span>
          {/* The dropped columns, folded back in for mobile. */}
          <span className="truncate text-[11px] text-muted-foreground md:hidden">
            {time}
            {category?.name ? ` · ${category.name}` : ''}
          </span>
        </span>

        <span className="hidden w-[130px] shrink-0 truncate text-xs text-muted-foreground md:block">
          {category?.name ?? ''}
        </span>

        <span
          className={cn(
            'shrink-0 text-right font-mono text-sm font-semibold whitespace-nowrap',
            'min-w-[86px] md:min-w-[112px]',
            transaction.isIncome ? 'text-income' : 'text-expense',
          )}
        >
          {transaction.isIncome ? '+' : '−'}
          {formatINR(transaction.amount)}
        </span>

        <span className="hidden w-[68px] shrink-0 justify-end gap-0.5 md:flex">
          <button
            type="button"
            aria-label={`Edit ${label}`}
            onClick={(e) => {
              e.stopPropagation()
              onEdit?.(transaction)
            }}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${label}`}
            onClick={(e) => {
              e.stopPropagation()
              onDelete?.(transaction)
            }}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </motion.div>
    </div>
  )
}
