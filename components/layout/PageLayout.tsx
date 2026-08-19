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

      {/* Main column.
          min-w-0 is load-bearing: a flex item defaults to min-width:auto, so a
          max-content child (e.g. a horizontally scrollable chip row) propagates
          its intrinsic width all the way up and makes the whole app scroll
          sideways. */}
      <div className="flex flex-1 flex-col min-h-0 min-w-0">
        <TopBar />

        {/* Scrollable content area */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pb-16 lg:pb-0">
          {children}
        </main>

        {/* Bottom nav — mobile only */}
        <BottomNav />
      </div>
    </div>
  )
}
