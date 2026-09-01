'use client'

import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'
import { Sidebar } from './Sidebar'
import { Fab } from './Fab'
import { usePageChromeValue } from './PageChrome'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

interface PageLayoutProps {
  children: React.ReactNode
}

export function PageLayout({ children }: PageLayoutProps) {
  const density = usePreferencesStore((s) => s.density)
  const { title, meta, onBack, primaryAction } = usePageChromeValue()

  useKeyboardShortcuts({ onPrimaryAction: primaryAction?.onClick })

  return (
    // data-density drives the six spacing custom properties in globals.css, so
    // the whole tree rescales from one attribute.
    <div data-density={density} className="flex h-full">
      <Sidebar />

      {/* min-w-0 is load-bearing: a flex item defaults to min-width:auto, so a
          max-content child (e.g. a horizontally scrollable chip row) propagates
          its intrinsic width all the way up and makes the whole app scroll
          sideways. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar title={title} meta={meta} onBack={onBack} primaryAction={primaryAction} />

        <main className="scrollbar-thin min-w-0 flex-1 overflow-x-hidden overflow-y-auto pb-[66px] md:pb-0">
          {children}
        </main>
      </div>

      {primaryAction && <Fab onClick={primaryAction.onClick} label={primaryAction.label} />}
      <BottomNav />
    </div>
  )
}
