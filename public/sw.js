// Minimal service worker for Paisa PWA installability.
//
// @ducanh2912/next-pwa was evaluated for this project and is incompatible
// with Next.js 16's default Turbopack build (see next.config.ts history /
// PR description for details) — it only wires a `webpack` config, and
// `next build` on Next 16 uses Turbopack by default, which refuses to
// build when a `webpack` config is present without a matching `turbopack`
// config. Forcing `--webpack` for the whole production build just to get
// a service worker was judged too invasive, so this hand-written worker
// is a deliberate placeholder: it does nothing but register successfully,
// satisfying "a service worker is registered" for installability.
//
// This is intentionally a passthrough — no caching, no offline support.
// This is a financial app; caching API responses (transactions, ledger
// balances, etc.) here would risk serving stale financial data. If real
// offline/caching behavior is wanted later, revisit a Turbopack-compatible
// approach (or a project-owned Workbox build step) rather than reaching
// for this file.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Passthrough fetch handler: let every request go straight to the network
// exactly as it would with no service worker at all.
self.addEventListener('fetch', () => {})
