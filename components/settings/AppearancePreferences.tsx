'use client'

import { Switch } from '@/components/ui/switch'
import { usePreferencesStore, type Density } from '@/store/usePreferencesStore'

interface PreferenceRowProps {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function PreferenceRow({ label, description, checked, onCheckedChange }: PreferenceRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-(--pad-card)">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  )
}

/**
 * Three switches, each a second entry point onto state that already lives
 * elsewhere in the shell — density has the TopBar's SegmentedControl,
 * navOpen has the sidebar's toggle button/`b` shortcut. Reduced motion is
 * the one preference that is new here.
 */
export function AppearancePreferences() {
  const reducedMotion = usePreferencesStore((s) => s.reducedMotion)
  const setReducedMotion = usePreferencesStore((s) => s.setReducedMotion)
  const density = usePreferencesStore((s) => s.density)
  const setDensity = usePreferencesStore((s) => s.setDensity)
  const navOpen = usePreferencesStore((s) => s.navOpen)
  const setNavOpen = usePreferencesStore((s) => s.setNavOpen)

  return (
    <div className="flex flex-col gap-(--row-gap)">
      <PreferenceRow
        label="Reduced motion"
        description="Turn off page-transition animations."
        checked={reducedMotion}
        onCheckedChange={setReducedMotion}
      />
      <PreferenceRow
        label="Dense layout"
        description="Tighter row spacing across Log, Budgets and Ledger."
        checked={density === 'dense'}
        onCheckedChange={(checked) => setDensity((checked ? 'dense' : 'comfortable') satisfies Density)}
      />
      <PreferenceRow
        label="Expanded sidebar"
        description="Show labels in the desktop navigation rail."
        checked={navOpen}
        onCheckedChange={setNavOpen}
      />
    </div>
  )
}
