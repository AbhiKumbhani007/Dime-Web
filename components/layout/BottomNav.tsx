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

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 h-16 pb-safe bg-[var(--card)] border-t border-[var(--border)] lg:hidden"
      aria-label="Bottom navigation"
    >
      <div className="flex h-full items-center justify-around px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 min-w-[56px] transition-colors',
                isActive
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
