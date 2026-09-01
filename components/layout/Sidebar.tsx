'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, isNavItemActive } from '@/lib/nav'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useAuthStore } from '@/store/useAuthStore'
import { BrandMark } from '@/components/brand/Wordmark'
import { logout as logoutRequest } from '@/lib/api/auth'

/**
 * Primary navigation, `md` and up.
 *
 * Two widths: 240px expanded and a 64px icon rail. Tablet is always a rail —
 * there isn't room for labels beside the content — so the user's `navOpen`
 * preference only applies from `lg`.
 *
 * That "only from lg" rule is expressed in CSS (`lg:` variants gated on the
 * `expanded` class) rather than a JS media query. It means the sidebar tracks a
 * window resize instantly, with no hydration mismatch and no re-render — and
 * the rail is what renders on the server, which is the safe default.
 */
export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const navOpen = usePreferencesStore((s) => s.navOpen)
  const toggleNav = usePreferencesStore((s) => s.toggleNav)
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  async function handleLogout() {
    const refreshToken = localStorage.getItem('dime-refresh-token')
    if (refreshToken) {
      await logoutRequest({ refreshToken }).catch(() => {})
      localStorage.removeItem('dime-refresh-token')
    }
    clearAuth()
    router.push('/login')
  }

  const name = user?.name || user?.email || 'Account'

  // Every "expanded" rule below is an `lg:` variant, so the rail is the base
  // state and expansion only ever applies from lg up — tablet stays a rail
  // regardless of the stored preference.
  const expanded = navOpen

  return (
    <aside
      aria-label="Sidebar navigation"
      className={cn(
        'hidden h-full w-16 shrink-0 flex-col border-r border-border bg-card px-3 pt-[18px] pb-3.5 md:flex',
        expanded && 'lg:w-[240px]',
      )}
    >
      {/* Brand + collapse toggle. The rail stacks them vertically. */}
      <div
        className={cn(
          'flex flex-col items-center gap-2.5 px-1.5 pb-5',
          expanded && 'lg:flex-row',
        )}
      >
        <BrandMark />
        <span
          className={cn(
            'hidden min-w-0 flex-1 text-[19px] font-bold tracking-[-0.025em]',
            expanded && 'lg:block',
          )}
        >
          Paisa
        </span>
        <button
          type="button"
          onClick={toggleNav}
          aria-label="Toggle sidebar"
          aria-expanded={!!navOpen}
          title="Toggle sidebar — b"
          className="hidden h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring lg:flex"
        >
          <PanelLeft className={cn('h-4 w-4 transition-transform', !navOpen && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex flex-col gap-[3px]">
        {NAV_ITEMS.map(({ href, label, icon: Icon, key }) => {
          const active = isNavItemActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center justify-center gap-[11px] rounded-[10px] px-2.5 text-[13.5px] transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                expanded && 'lg:justify-start',
                active
                  ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-semibold text-accent'
                  : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {/* Rendered always so the accessible name survives in the rail,
                  where the label is visually hidden but still announced. */}
              <span className={cn('sr-only min-w-0 flex-1', expanded && 'lg:not-sr-only')}>{label}</span>
              <span
                aria-hidden
                className={cn('hidden shrink-0 font-mono text-[9.5px] text-muted-foreground', expanded && 'lg:block')}
              >
                {key}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className={cn('mt-auto hidden', expanded && 'lg:block')}>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] px-1.5 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {name.charAt(0).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium text-foreground">{name}</span>
            <span className="truncate text-[10px] text-muted-foreground">Sign out</span>
          </span>
        </button>
      </div>
    </aside>
  )
}
