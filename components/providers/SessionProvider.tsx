'use client'

/**
 * SessionProvider — mounts once at the top of the authenticated shell.
 *
 * Two jobs:
 *  1. Wires up the ky API client (initApiClient) so the Bearer token
 *     interceptor can read/write the Zustand access-token at runtime.
 *  2. Restores the session on hard reload:
 *       - accessToken is memory-only (not persisted), so after a reload
 *         it is always null even though user + refreshToken are intact.
 *       - We silently call POST /api/auth/refresh.  On success we set the
 *         new accessToken in the store and let the app render.
 *       - On failure we clear auth and send the user to /login.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/useAuthStore'
import { initApiClient } from '@/lib/api'

type Status = 'loading' | 'ready' | 'unauthenticated'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { accessToken, setAccessToken, clearAuth } = useAuthStore()
  const [status, setStatus] = useState<Status>(accessToken ? 'ready' : 'loading')
  const ran = useRef(false)

  useEffect(() => {
    // Wire the ky interceptor to the live Zustand store
    initApiClient(
      () => useAuthStore.getState().accessToken,
      (token) => useAuthStore.getState().setAccessToken(token),
      () => {
        useAuthStore.getState().clearAuth()
        localStorage.removeItem('dime-refresh-token')
      }
    )

    // Only run the session-restoration check once
    if (ran.current) return
    ran.current = true

    // If we already have an access token (e.g. navigating between pages
    // without a full reload) there is nothing to do.
    if (useAuthStore.getState().accessToken) {
      setStatus('ready')
      return
    }

    const storedRefreshToken = localStorage.getItem('dime-refresh-token')
    if (!storedRefreshToken) {
      setStatus('unauthenticated')
      router.replace('/login')
      return
    }

    // Silent refresh — use plain fetch to avoid the ky interceptor loop
    fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefreshToken }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('refresh_failed')
        return res.json() as Promise<{ accessToken: string; refreshToken: string }>
      })
      .then(({ accessToken: newToken, refreshToken: newRefresh }) => {
        setAccessToken(newToken)
        localStorage.setItem('dime-refresh-token', newRefresh)
        setStatus('ready')
      })
      .catch(() => {
        clearAuth()
        localStorage.removeItem('dime-refresh-token')
        setStatus('unauthenticated')
        router.replace('/login')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="h-6 w-6 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  return <>{children}</>
}
