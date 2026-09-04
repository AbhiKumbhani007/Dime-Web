'use client'

import { useMemo } from 'react'
import { usePageChrome } from '@/components/layout/PageChrome'
import { ThemeSelector } from '@/components/settings/ThemeSelector'
import { AppearancePreferences } from '@/components/settings/AppearancePreferences'

export default function AppearancePage() {
  usePageChrome(useMemo(() => ({ title: 'Appearance' }), []))

  return (
    <div className="flex flex-col gap-(--gap) p-(--pad-page)">
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Theme</h3>
        <ThemeSelector />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preferences</h3>
        <AppearancePreferences />
      </section>
    </div>
  )
}
