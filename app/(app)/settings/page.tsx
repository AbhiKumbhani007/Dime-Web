import { redirect } from 'next/navigation'

/**
 * Deep-link redirect only — `/settings` has no content of its own now that
 * the six sections each have a route under the settings layout/rail.
 * Appearance is first in the rail, so it's the default landing section.
 */
export default function SettingsPage() {
  redirect('/settings/appearance')
}
