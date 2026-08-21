'use client'

import { useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useDrag } from '@use-gesture/react'
import { Trash2 } from 'lucide-react'
import { formatINR } from '@/lib/utils/currency'
import { formatTime } from '@/lib/utils/date'
import type { Transaction } from '@/lib/api/transactions'
import type { Category } from '@/lib/api/categories'

interface TransactionItemProps {
  transaction: Transaction
  category?: Category
  onDelete?: (tx: Transaction) => void
  onEdit?: (tx: Transaction) => void
}

const SWIPE_THRESHOLD = 80

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
        const shouldDelete =
          mx < -SWIPE_THRESHOLD || (vx > 0.5 && dx < 0)
        if (shouldDelete && onDelete) {
          animate(x, -400, { duration: 0.18, onComplete: () => onDelete(transaction) })
        } else {
          // Spring back
          animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 })
        }
      }
    },
    { axis: 'x', filterTaps: true, pointer: { capture: false } }
  )

  function handleClick() {
    if (!dragging && onEdit) onEdit(transaction)
  }

  const amountText = formatINR(transaction.amount)
  const amountClass = transaction.isIncome
    ? 'text-[color:var(--success,#22c55e)]'
    : 'text-[var(--destructive)]'

  const emoji = category?.emoji ?? '💸'
  const color = category?.color ?? '#6b7280'
  const label = transaction.note?.trim() || category?.name || 'Transaction'

  return (
    <div className="relative overflow-hidden select-none">
      {/* Delete background */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end pr-6 bg-[var(--destructive)] text-[var(--destructive-foreground,white)] pointer-events-none"
        style={{ opacity: bgOpacity }}
        aria-hidden
      >
        <Trash2 className="h-5 w-5" />
      </motion.div>

      <motion.div
        {...(bind() as React.ComponentProps<typeof motion.div>)}
        data-testid={`transaction-${transaction.id}`}
        style={{ x, touchAction: 'pan-y' }}
        onClick={handleClick}
        className="flex items-center gap-3 px-4 py-3 bg-[var(--card)] border-b border-[var(--border)] cursor-pointer"
      >
        <span
          aria-hidden
          className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 text-base"
          style={{ backgroundColor: color + '20', color }}
        >
          {emoji}
        </span>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm font-medium text-[var(--foreground)] truncate">
            {label}
          </span>
          <span className="text-xs text-[var(--muted-foreground)]">
            {formatTime(transaction.date)}
          </span>
        </div>
        <span className={`text-sm font-semibold ${amountClass}`}>
          {transaction.isIncome ? '+' : '−'}
          {amountText}
        </span>
      </motion.div>
    </div>
  )
}
