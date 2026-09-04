'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Palette, User, FileSpreadsheet, Tag, LayoutTemplate, Info, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isNavItemActive } from '@/lib/nav'
import { ChipRow } from '@/components/ui/chip-row'
import { useCategories } from '@/hooks/useCategories'
import { useTemplates } from '@/hooks/useTemplates'

interface SettingsNavItem {
  href: string
  label: string
  icon: LucideIcon
}

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { href: '/settings/appearance', label: 'Appearance', icon: Palette },
  { href: '/settings/account', label: 'Account', icon: User },
  { href: '/settings/data', label: 'Data & CSV', icon: FileSpreadsheet },
  { href: '/settings/categories', label: 'Categories', icon: Tag },
  { href: '/settings/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/settings/about', label: 'About', icon: Info },
]

/**
 * Settings navigation — six fixed sections, always visible (unlike the
 * Ledger rail, which can hide on mobile once an entry is selected because
 * its list is dynamic; Settings never has zero sections).
 *
 * Below `md` it renders as a horizontal `ChipRow` above the page content.
 * From `md` it becomes a vertical rail beside the content — 176px on
 * tablet, 212px on desktop.
 */
export function SettingsRail() {
  const pathname = usePathname()
  const { data: categoriesData } = useCategories()
  const categoryCount = categoriesData?.categories.length ?? 0
  const { data: templatesData } = useTemplates()
  const templateCount = templatesData?.templates.length ?? 0

  function badgeFor(href: string): number | undefined {
    if (href === '/settings/categories') return categoryCount
    if (href === '/settings/templates') return templateCount
    return undefined
  }

  return (
    <>
      {/* Mobile: horizontal scroll row above the content. */}
      <div className="border-b border-border p-(--pad-page) md:hidden">
        <ChipRow label="Settings sections" role="group">
          {SETTINGS_NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href)
            const badge = badgeFor(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                  active
                    ? 'border-transparent bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
                {typeof badge === 'number' && badge > 0 && (
                  <span
                    aria-hidden
                    className="rounded-full bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground"
                  >
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}
        </ChipRow>
      </div>

      {/* Tablet/desktop: vertical rail beside the content. */}
      <nav
        aria-label="Settings sections"
        className="hidden shrink-0 flex-col gap-[3px] border-border p-(--pad-page) md:flex md:w-[176px] md:border-r lg:w-[212px] lg:shrink-0 lg:border-r lg:border-border"
      >
        {SETTINGS_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href)
          const badge = badgeFor(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center gap-[11px] rounded-[10px] px-2.5 text-[13.5px] transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                active
                  ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-semibold text-accent'
                  : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {typeof badge === 'number' && badge > 0 && (
                <span
                  aria-hidden
                  className="shrink-0 rounded-full bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground"
                >
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
