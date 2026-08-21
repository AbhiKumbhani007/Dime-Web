'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReceiptText, BarChart3, Target, Users, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/log', label: 'Log', icon: ReceiptText },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/budgets', label: 'Budgets', icon: Target },
  { href: '/ledger', label: 'Ledger', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex flex-col w-[220px] h-full border-r border-[var(--border)] bg-[var(--card)] py-4 px-3 shrink-0">
      {/* Brand */}
      <div className="mb-6 px-3">
        <span className="font-bold text-xl text-[var(--foreground)]">Dime</span>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Sidebar navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
