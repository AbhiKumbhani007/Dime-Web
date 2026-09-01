'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { useAuthStore } from '@/store/useAuthStore'

/**
 * Applies the theme stored on the user's account, so it follows them across
 * devices rather than living only in this browser's localStorage.
 *
 * The effect keys on `userTheme` rather than running once on mount: the user is
 * fetched asynchronously by SessionProvider, so at mount `userTheme` is almost
 * always undefined and a mount-only effect silently never syncs. That left
 * whatever next-themes had cached locally winning permanently.
 *
 * `theme` is deliberately not a dependency — including it would re-assert the
 * account theme every time the user picks a different one in Settings, making
 * the selector impossible to use. ThemeSelector writes to both next-themes and
 * the account, so the two stay consistent from that direction.
 */
export function ThemeSync() {
  const { setTheme } = useTheme()
  const userTheme = useAuthStore((s) => s.user?.theme)
  const applied = useRef<string | null>(null)

  useEffect(() => {
    if (!userTheme || applied.current === userTheme) return
    applied.current = userTheme
    setTheme(userTheme)
  }, [userTheme, setTheme])

  return null
}
