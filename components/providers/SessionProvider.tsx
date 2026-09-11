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
 *  3. Re-reads the user from the server once the session is ready.
 *     `user` is persisted in localStorage, so without this it stays frozen
 *     at whatever it was when this browser last logged in — which meant an
 *     account-level setting like `theme` never propagated to another device.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/useAuthStore'
import { initApiClient } from '@/lib/api'
import { getMe } from '@/lib/api/auth'

type Status = 'loading' | 'ready' | 'unauthenticated'

// Same-origin — see lib/api.ts's identical constant for why this is
// computed (not dropped entirely) and guarded against SSR, where `window`
// doesn't exist but this module's top-level code still runs.
const API_URL = typeof window !== 'undefined' ? window.location.origin : ''

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

  // Refresh the cached user once we have a working token. Deliberately not
  // gated on success: a failure here just leaves the persisted copy in place,
  // which is strictly better than blocking the app on a non-essential read.
  useEffect(() => {
    if (status !== 'ready') return
    getMe()
      .then((freshUser) => useAuthStore.getState().updateUser(freshUser))
      .catch(() => {})
  }, [status])

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
