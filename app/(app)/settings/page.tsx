'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, ChevronRight, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/useAuthStore'
import { logout } from '@/lib/api/auth'
import { ThemeSelector } from '@/components/settings/ThemeSelector'

export default function SettingsPage() {
  const router = useRouter()
  const clearAuth = useAuthStore((s) => s.clearAuth)

  async function handleLogout() {
    const refreshToken = localStorage.getItem('dime-refresh-token')
    if (refreshToken) {
      await logout({ refreshToken }).catch(() => {})
    }
    clearAuth()
    localStorage.removeItem('dime-refresh-token')
    router.replace('/login')
  }

  return (
    <div className="flex flex-1 flex-col p-6">
      <h2 className="text-lg font-semibold text-[var(--foreground)] mb-6">Settings</h2>

      <section className="mb-6">
        <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Appearance</h3>
        <ThemeSelector />
      </section>

      <section className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-3">
          Data
        </h3>
        <Link
          href="/settings/categories"
          className="flex items-center justify-between rounded-xl bg-[var(--card)] border border-[var(--border)] px-4 py-3 hover:bg-[var(--muted)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <Tag className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-sm font-medium text-[var(--foreground)]">Categories</span>
          </div>
          <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />
        </Link>
      </section>

      <div className="mt-auto pt-8 border-t border-[var(--border)]">
        <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">Account</h3>
        <Button
          variant="destructive"
          className="w-full"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log out
        </Button>
      </div>
    </div>
  )
}
