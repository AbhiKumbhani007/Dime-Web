import { cn } from '@/lib/utils'

const MARK_SIZE = {
  sm: 'h-[30px] w-[30px] rounded-[9px] text-[17px]',
  md: 'h-[34px] w-[34px] rounded-[10px] text-[19px]',
  lg: 'h-[72px] w-[72px] rounded-[20px] text-[42px]',
} as const

const TEXT_SIZE = {
  sm: 'text-[19px]',
  md: 'text-[22px]',
  lg: 'text-[17px]',
} as const

interface BrandMarkProps {
  size?: keyof typeof MARK_SIZE
  className?: string
}

/** The ₹ app mark — a filled primary tile. Used on its own in the sidebar rail. */
export function BrandMark({ size = 'sm', className }: BrandMarkProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-primary font-semibold leading-none text-primary-foreground',
        MARK_SIZE[size],
        className,
      )}
    >
      ₹
    </span>
  )
}

interface WordmarkProps extends BrandMarkProps {
  /** Hide the "Paisa" text and show only the mark — the collapsed sidebar rail. */
  markOnly?: boolean
}

export function Wordmark({ size = 'sm', markOnly = false, className }: WordmarkProps) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={size} />
      {!markOnly && (
        <span className={cn('font-bold tracking-[-0.025em]', TEXT_SIZE[size])}>Paisa</span>
      )}
    </span>
  )
}
