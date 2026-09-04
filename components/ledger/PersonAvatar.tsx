import { cn } from '@/lib/utils'

interface PersonAvatarProps {
  name: string
  color: string
  size?: 'sm' | 'lg'
  className?: string
}

const SIZE_CLASSES: Record<NonNullable<PersonAvatarProps['size']>, string> = {
  sm: 'h-9 w-9 text-[15px]',
  lg: 'h-[60px] w-[60px] text-2xl',
}

/**
 * Colored circle + first-letter initial. Not `components/ui/avatar.tsx` — that
 * primitive is image+fallback shaped and unused elsewhere for this; this
 * follows `Sidebar.tsx`'s existing account-initial markup instead, since the
 * per-person colour is a stored hex value rather than a semantic token.
 */
export function PersonAvatar({ name, color, size = 'sm', className }: PersonAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        SIZE_CLASSES[size],
        className,
      )}
      style={{ background: color }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
