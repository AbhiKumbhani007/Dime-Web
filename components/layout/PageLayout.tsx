'use client'

import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'
import { Sidebar } from './Sidebar'

interface PageLayoutProps {
  children: React.ReactNode
}

export function PageLayout({ children }: PageLayoutProps) {
  return (
    <div className="flex h-full">
      {/* Sidebar — desktop only */}
      <Sidebar />

      {/* Main column */}
      <div className="flex flex-1 flex-col min-h-0">
        <TopBar />

        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          {children}
        </main>

        {/* Bottom nav — mobile only */}
        <BottomNav />
      </div>
    </div>
  )
}
