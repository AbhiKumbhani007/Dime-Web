'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { getMe } from '@/lib/api/auth'

export function useCurrentUser() {
  const { user, accessToken, setAuth } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!accessToken) return

    setIsLoading(true)
    getMe()
      .then((freshUser) => {
        // Update user data in store (keep same accessToken)
        setAuth(freshUser, accessToken)
      })
      .catch(() => {
        // Token may be invalid; the api.ts refresh logic handles 401s
      })
      .finally(() => {
        setIsLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run only on mount

  return { user, isLoading }
}
