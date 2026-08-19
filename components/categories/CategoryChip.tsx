'use client'

import { useRef } from 'react'
import { Pencil } from 'lucide-react'
import type { Category } from '@/lib/api/categories'

interface CategoryChipProps {
  category: Category
  onEdit?: () => void
  onDelete?: () => void
  size?: 'sm' | 'md'
}

export function CategoryChip({ category, onEdit, onDelete, size = 'md' }: CategoryChipProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handlePointerDown() {
    if (!onDelete) return
    timerRef.current = setTimeout(() => {
      onDelete()
    }, 500)
  }

  function cancelLongPress() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function handleClick(e: React.MouseEvent) {
    // If long press fired, don't trigger click
    if (!timerRef.current) return
    cancelLongPress()
    onEdit?.()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`rounded-full px-3 py-1.5 flex items-center gap-2 bg-[var(--card)] border border-[var(--border)] cursor-pointer select-none ${size === 'sm' ? 'text-xs' : 'text-sm'}`}
      onPointerDown={handlePointerDown}
      onPointerUp={(e) => {
        if (timerRef.current) {
          cancelLongPress()
          onEdit?.()
        }
      }}
      onPointerLeave={cancelLongPress}
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onEdit?.()
        }
      }}
    >
      <span
        className={`rounded-full flex items-center justify-center flex-shrink-0 ${size === 'sm' ? 'w-4 h-4 text-xs' : 'w-5 h-5 text-sm'}`}
        style={{ backgroundColor: category.color }}
      >
        <span className="text-[10px] leading-none">{category.emoji}</span>
      </span>
      <span className="text-[var(--foreground)] font-medium truncate">{category.name}</span>
      {onEdit && (
        <Pencil
          size={12}
          className="text-[var(--muted-foreground)] flex-shrink-0 ml-auto"
        />
      )}
    </div>
  )
}
