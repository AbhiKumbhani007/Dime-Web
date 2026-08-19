'use client'

import { usePathname } from 'next/navigation'
import { routeTitles } from '@/lib/routeTitles'

interface TopBarProps {
  title?: string
  rightAction?: React.ReactNode
}

export function TopBar({ title, rightAction }: TopBarProps) {
  const pathname = usePathname()
  const resolvedTitle = title ?? routeTitles[pathname] ?? ''

  return (
    <header className="sticky top-0 z-40 h-14 flex items-center justify-between px-4 bg-[var(--card)] border-b border-[var(--border)]">
      <h1 className="text-lg font-bold text-[var(--foreground)]">{resolvedTitle}</h1>
      {rightAction && <div className="flex items-center">{rightAction}</div>}
    </header>
  )
}
