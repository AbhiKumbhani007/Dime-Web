'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useAuthStore } from '@/store/useAuthStore'

export function ThemeSync() {
  const { theme, setTheme } = useTheme()
  const userTheme = useAuthStore((s) => s.user?.theme)

  useEffect(() => {
    if (userTheme && userTheme !== theme) {
      setTheme(userTheme)
    }
    // Only run on mount — intentionally omitting `theme` from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
