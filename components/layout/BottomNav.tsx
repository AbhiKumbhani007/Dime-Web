'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, isNavItemActive } from '@/lib/nav'

/**
 * Mobile navigation, below `md`. The active state is a pill around the icon
 * only — not the whole item — so the labels stay on a common baseline.
 */
export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Bottom navigation"
      className="pb-safe fixed inset-x-0 bottom-0 z-50 flex h-[66px] shrink-0 items-stretch border-t border-border bg-card md:hidden"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isNavItemActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-1.5',
              active ? 'text-accent' : 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex h-[26px] w-11 items-center justify-center rounded-full transition-colors',
                active && 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]',
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className={cn('text-[10px] leading-none', active ? 'font-semibold' : 'font-medium')}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
