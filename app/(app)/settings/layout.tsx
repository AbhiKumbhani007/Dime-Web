import { SettingsRail } from '@/components/settings/SettingsRail'

/**
 * Settings shell — a fixed rail beside (from `md`) or above (mobile) the
 * active section. Mirrors the flex/responsive structure of the Ledger
 * two-pane shell (`app/(app)/ledger/page.tsx`), except the rail here is
 * always visible: there are exactly six sections, never zero, so there is
 * no "nothing selected" state to collapse to.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full min-w-0 flex-col md:flex-row">
      <SettingsRail />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
