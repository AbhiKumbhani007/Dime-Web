import { cn } from '@/lib/utils'

/** 15% alpha wash of an entity's colour, used behind its emoji. */
export function colourWash(hex: string): string {
  return `${hex}26`
}

interface EmojiTileProps {
  emoji: string
  /** Entity hex, e.g. a category's `color` or a budget's `colour`. */
  colour: string
  /**
   * `round` for transaction rows, `square` for budgets, categories and
   * templates. DESIGN.md §8 flagged these having drifted apart; this is the
   * one place the two shapes are defined.
   */
  shape?: 'round' | 'square'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE = {
  sm: 'h-7 w-7 text-sm',
  md: 'h-[34px] w-[34px] text-base',
  lg: 'h-10 w-10 text-[19px]',
} as const

const RADIUS = {
  sm: 'rounded-[9px]',
  md: 'rounded-[10px]',
  lg: 'rounded-xl',
} as const

export function EmojiTile({ emoji, colour, shape = 'round', size = 'md', className }: EmojiTileProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center leading-none',
        SIZE[size],
        shape === 'round' ? 'rounded-full' : RADIUS[size],
        className,
      )}
      style={{ backgroundColor: colourWash(colour) }}
    >
      {emoji}
    </span>
  )
}
