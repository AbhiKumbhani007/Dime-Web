'use client'

import { useEffect } from 'react'

/**
 * Registers the minimal placeholder service worker (public/sw.js) so the
 * app is installable as a PWA.
 *
 * A dedicated PWA plugin (@ducanh2912/next-pwa) was evaluated but is
 * webpack-only and Next.js 16 builds with Turbopack by default, which
 * fails outright when a webpack-only config is present. Rather than force
 * the whole production build onto webpack, this renders nothing and just
 * registers public/sw.js directly with the browser's Service Worker API —
 * enough for installability, with no caching behavior to risk serving
 * stale financial data.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is a progressive enhancement; a failed registration
      // (e.g. unsupported browser, dev-only quirk) shouldn't affect the app.
    })
  }, [])

  return null
}
