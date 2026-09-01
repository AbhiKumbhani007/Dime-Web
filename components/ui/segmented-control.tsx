'use client'

import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name for the group, e.g. "Row density". */
  label: string
  /** `radiogroup` for a filter, `tablist` when the choice swaps a panel. */
  role?: 'radiogroup' | 'tablist'
  size?: 'sm' | 'md'
  className?: string
}

/**
 * The recessed pill toggle used for Expense/Income, Comfortable/Dense,
 * Out/In and the Insights period tabs. The active segment lifts to `--card`
 * against a `--muted` track.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  role = 'radiogroup',
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const isTabs = role === 'tablist'

  return (
    <div
      role={role}
      aria-label={label}
      className={cn('inline-flex gap-0.5 rounded-[9px] bg-muted p-[3px]', className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            aria-selected={isTabs ? selected : undefined}
            aria-checked={isTabs ? undefined : selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'cursor-pointer rounded-md font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
              size === 'sm' ? 'px-2.5 py-[5px] text-[11.5px]' : 'px-[11px] py-1.5 text-[11.5px]',
              selected ? 'bg-card text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
