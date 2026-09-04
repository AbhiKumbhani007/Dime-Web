'use client'

import { useMemo, useState } from 'react'
import { usePageChrome } from '@/components/layout/PageChrome'
import { useAuthStore } from '@/store/useAuthStore'
import { AccountForm } from '@/components/settings/AccountForm'
import { DeleteAccountDialog } from '@/components/settings/DeleteAccountDialog'
import { Button } from '@/components/ui/button'
import { formatDateLong } from '@/lib/utils/date'

export default function AccountPage() {
  usePageChrome(useMemo(() => ({ title: 'Account' }), []))

  const user = useAuthStore((s) => s.user)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const name = user?.name || user?.email || 'Account'
  const initial = name.charAt(0).toUpperCase()

  return (
    <div className="flex flex-col gap-(--gap) p-(--pad-page)">
      {/* Identity summary — initial avatar mirrors the account markup in
          Sidebar.tsx (bg-primary/text-primary-foreground) rather than
          PersonAvatar, since there is no stored per-user colour here. */}
      <section className="flex items-center gap-4 rounded-xl border border-border bg-card p-(--pad-card)">
        <span
          aria-hidden
          className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground"
        >
          {initial}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-base font-semibold text-foreground">{name}</span>
          {user?.createdAt && (
            <span className="text-xs text-muted-foreground">
              Joined {formatDateLong(user.createdAt)}
            </span>
          )}
          {user?.email && (
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          )}
        </div>
      </section>

      <AccountForm />

      {/* Danger zone — account deletion is the only destructive action on
          this page, so it gets its own visually distinct section. */}
      <section className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-card p-(--pad-card)">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-foreground">Danger zone</h3>
          <p className="text-xs text-muted-foreground">
            Permanently delete your account and all associated data. This cannot be undone.
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="w-fit"
          onClick={() => setDeleteOpen(true)}
        >
          Delete account
        </Button>
      </section>

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  )
}
