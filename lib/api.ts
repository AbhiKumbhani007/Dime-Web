import ky, { type KyInstance, type Options } from 'ky'

// dime-web now serves its own API routes (the backend-merge phase folded
// dime-api's routes in under app/api/*) — every call goes to this app's own
// origin, not a separately-hosted backend. `ky`'s `prefixUrl` must be an
// absolute value (every lib/api/*.ts call site passes its path without a
// leading slash, e.g. api.get('api/categories'), because `ky` throws if
// `input` starts with `/` while `prefixUrl` is set) — a relative/empty
// prefixUrl would make the browser resolve those paths against the current
// page's path instead of the origin (e.g. `/settings/api/categories` from
// `/settings/account`), which is wrong on every route except `/`.
// `window` is guarded because this module's top-level code still runs
// during SSR: SessionProvider (which wires this client up) sits under
// app/(app)/layout.tsx, a 'use client' boundary that Next.js still
// server-renders for the initial HTML.
const API_URL = typeof window !== 'undefined' ? window.location.origin : ''

// Lazy import to avoid circular deps — auth store is client-only
function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    // Zustand persists user to localStorage; accessToken is in-memory only,
    // so we read it from the store instance directly when available.
    // This function is replaced at runtime by initApiClient().
    return null
  } catch {
    return null
  }
}

let _getToken: () => string | null = getAccessToken
let _setToken: (token: string) => void = () => {}
let _clearAuth: () => void = () => {}

/** Call once from a client component (e.g. the root auth provider) to wire up the store. */
export function initApiClient(
  getToken: () => string | null,
  setToken: (t: string) => void,
  clearAuth: () => void
) {
  _getToken = getToken
  _setToken = setToken
  _clearAuth = clearAuth
}

let isRefreshing = false
let pendingRequests: Array<(token: string) => void> = []

async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = localStorage.getItem('dime-refresh-token')
    if (!refreshToken) return null

    const res = await ky
      .post(`${API_URL}/api/auth/refresh`, {
        json: { refreshToken },
        throwHttpErrors: false,
      })
      .json<{ accessToken: string; refreshToken: string }>()

    const newToken = res.accessToken
    _setToken(newToken)
    // Rotate the stored refresh token
    localStorage.setItem('dime-refresh-token', res.refreshToken)
    return newToken
  } catch {
    _clearAuth()
    localStorage.removeItem('dime-refresh-token')
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    return null
  }
}

export const api: KyInstance = ky.create({
  prefixUrl: API_URL,
  timeout: 30000,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = _getToken()
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      },
    ],
    afterResponse: [
      async (request, _options, response) => {
        if (response.status !== 401) return response

        // Avoid infinite refresh loops
        if (request.url.includes('/api/auth/refresh')) {
          _clearAuth()
          return response
        }

        if (isRefreshing) {
          // Queue this request until the refresh completes
          return new Promise<Response>((resolve) => {
            pendingRequests.push(async (newToken: string) => {
              request.headers.set('Authorization', `Bearer ${newToken}`)
              resolve(await fetch(request))
            })
          })
        }

        isRefreshing = true
        const newToken = await refreshAccessToken()
        isRefreshing = false

        if (!newToken) return response

        // Drain queued requests
        pendingRequests.forEach((cb) => cb(newToken))
        pendingRequests = []

        // Retry original request
        request.headers.set('Authorization', `Bearer ${newToken}`)
        return fetch(request)
      },
    ],
  },
})

/** Helper to build typed API calls with the shared instance */
export function createApiCall<T>(
  path: string,
  method: 'get' | 'post' | 'patch' | 'delete' = 'get',
  options?: Options
) {
  return () => api[method](path, options).json<T>()
}
