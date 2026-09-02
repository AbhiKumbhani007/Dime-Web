import { ReceiptText, BarChart3, Target, Users, Settings, type LucideIcon } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Keyboard shortcut that jumps to this route, shown as a hint in the sidebar. */
  key: string
}

/**
 * The five primary destinations, in order. Shared by the desktop Sidebar and
 * the mobile BottomNav — they rendered separate copies of this list until the
 * redesign, which is how their icons drifted apart once already.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/log', label: 'Log', icon: ReceiptText, key: '1' },
  { href: '/insights', label: 'Insights', icon: BarChart3, key: '2' },
  { href: '/budgets', label: 'Budgets', icon: Target, key: '3' },
  { href: '/ledger', label: 'Ledger', icon: Users, key: '4' },
  { href: '/settings', label: 'Settings', icon: Settings, key: '5' },
]

/** Whether `pathname` is within a nav destination, so `/log/x` still lights up Log. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}
