// @vitest-environment node
// authenticate()/auth.service.ts import jose, which needs Node's real
// Uint8Array/CryptoKey realm — jsdom's globals are a different realm and
// fail jose's instanceof checks.
//
// Route-level adversarial coverage beyond auth.routes.test.ts: password-change
// session semantics, cross-user logout scoping, Google sign-in edge cases,
// and brute-force/rate-limit interaction. Every scenario here is one the
// ticket's own risk list called out explicitly.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { POST as login } from './login/route'
import { POST as logout } from './logout/route'
import { GET as meGet } from './me/route'
import { PATCH as passwordPatch } from './me/password/route'
import { POST as google } from './google/route'
import { prisma } from '@/lib/server/prisma'

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    category: {
      createMany: vi.fn(),
    },
    rateLimitBucket: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

const TEST_SECRET = 'test-jwt-access-secret-at-least-32-characters-long'

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'alice@example.com',
    name: 'Alice',
    passwordHash: null,
    theme: 'system',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

async function signToken(
  payload: Record<string, unknown> = {
    userId: 'user_1',
    email: 'alice@example.com',
  },
  options: { secret?: string; expiresIn?: string } = {}
) {
  const key = new TextEncoder().encode(options.secret ?? TEST_SECRET)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '15m')
    .sign(key)
}

function makeRequest(
  method: string,
  url: string,
  { token, body }: { token?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('auth routes — adversarial security cases', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.clearAllMocks()
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 1,
    } as never)
    vi.mocked(prisma.category.createMany).mockResolvedValue({
      count: 18,
    } as never)
    // updatePassword()'s post-change session revocation (deleteMany) and
    // refreshTokens()'s cleanup/atomic-claim calls run on every relevant
    // request — default to harmless values so tests that don't specifically
    // exercise these mechanics don't need to mock them individually.
    vi.mocked(prisma.refreshToken.deleteMany).mockResolvedValue({
      count: 0,
    } as never)
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({
      count: 1,
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('PATCH /api/auth/me/password — session semantics after a password change', () => {
    it('documents actual behavior: an access token issued before the change still authenticates /me afterward', async () => {
      // Access tokens are stateless JWTs verified only against the shared
      // secret + exp claim — updatePassword() never touches them. This test
      // pins the *actual* (not assumed) behavior: a token minted before the
      // password change keeps working until its own 15-minute TTL expires,
      // password change is not itself a revocation event for access tokens.
      // This IS now documented, explicitly, as an accepted tradeoff — see
      // auth.service.ts's updatePassword comment and docs/api.md's
      // `me/password` row: no server-side blocklist exists or should be
      // built for short-TTL access tokens. Refresh tokens are a different
      // story — see the next test — since those ARE revoked on a password
      // change (Fix 2).
      const bcrypt = (await import('bcryptjs')).default
      const oldHash = await bcrypt.hash('oldpassword', 10)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        baseUser({ passwordHash: oldHash }) as never
      )
      vi.mocked(prisma.user.update).mockResolvedValue(baseUser() as never)

      const preChangeToken = await signToken()

      const changeResponse = await passwordPatch(
        makeRequest('PATCH', 'http://localhost/api/auth/me/password', {
          token: preChangeToken,
          body: { oldPassword: 'oldpassword', newPassword: 'brandnewpw' },
        })
      )
      expect(changeResponse.status).toBe(200)

      // Now the password is changed server-side (from update()'s perspective);
      // getMe doesn't care about the password hash at all.
      vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser() as never)

      const meResponse = await meGet(
        makeRequest('GET', 'http://localhost/api/auth/me', {
          token: preChangeToken,
        })
      )
      expect(meResponse.status).toBe(200)
    })

    it('a refresh token issued before the change 401s on /api/auth/refresh afterward — every device is forced to re-login (Fix 2)', async () => {
      const bcrypt = (await import('bcryptjs')).default
      const oldHash = await bcrypt.hash('oldpassword', 10)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        baseUser({ passwordHash: oldHash }) as never
      )
      vi.mocked(prisma.user.update).mockResolvedValue(baseUser() as never)
      const token = await signToken()

      const changeResponse = await passwordPatch(
        makeRequest('PATCH', 'http://localhost/api/auth/me/password', {
          token,
          body: { oldPassword: 'oldpassword', newPassword: 'brandnewpw' },
        })
      )
      expect(changeResponse.status).toBe(200)
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user_1' },
      })

      // Simulates the real DB post-deleteMany: any pre-change refresh token
      // row is gone.
      const { POST: refresh } = await import('./refresh/route')
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(null)
      const refreshResponse = await refresh(
        makeRequest('POST', 'http://localhost/api/auth/refresh', {
          body: { refreshToken: 'pre-change-refresh-token' },
        })
      )
      expect(refreshResponse.status).toBe(401)
    })

    it('the OLD password no longer works for login after a successful change', async () => {
      const bcrypt = (await import('bcryptjs')).default
      const oldHash = await bcrypt.hash('oldpassword', 10)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        baseUser({ passwordHash: oldHash }) as never
      )
      vi.mocked(prisma.user.update).mockResolvedValue(baseUser() as never)
      const token = await signToken()

      const changeResponse = await passwordPatch(
        makeRequest('PATCH', 'http://localhost/api/auth/me/password', {
          token,
          body: { oldPassword: 'oldpassword', newPassword: 'brandnewpw' },
        })
      )
      expect(changeResponse.status).toBe(200)

      // After the change, the stored hash is the NEW one — simulate that by
      // returning a user whose passwordHash matches the new password, and
      // confirm login with the OLD password against that state fails.
      const newHash = await bcrypt.hash('brandnewpw', 10)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        baseUser({ passwordHash: newHash }) as never
      )

      const loginOldResponse = await login(
        makeRequest('POST', 'http://localhost/api/auth/login', {
          body: { email: 'alice@example.com', password: 'oldpassword' },
        })
      )
      expect(loginOldResponse.status).toBe(401)

      const loginNewResponse = await login(
        makeRequest('POST', 'http://localhost/api/auth/login', {
          body: { email: 'alice@example.com', password: 'brandnewpw' },
        })
      )
      expect(loginNewResponse.status).toBe(200)
    })
  })

  describe('POST /api/auth/logout — cross-session scoping', () => {
    it('a token belonging to a different session is unaffected by logging out an unrelated token', async () => {
      // Logout is scoped by exact token match (delete by unique `token`
      // column) — logging out token A must never touch token B's row.
      // Simulate: delete() only ever gets called with the exact token
      // passed, and only that call happens.
      vi.mocked(prisma.refreshToken.delete).mockResolvedValue({} as never)

      const response = await logout(
        makeRequest('POST', 'http://localhost/api/auth/logout', {
          body: { refreshToken: 'session-A-token' },
        })
      )
      expect(response.status).toBe(204)
      expect(prisma.refreshToken.delete).toHaveBeenCalledTimes(1)
      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { token: 'session-A-token' },
      })
      // Never a broader/user-scoped delete that could sweep up other
      // sessions by accident.
      expect(prisma.refreshToken.delete).not.toHaveBeenCalledWith({
        where: { token: 'session-B-token' },
      })
    })

    it('logout requires no bearer auth — the refresh token itself is the sole credential (by design, not a bug)', async () => {
      vi.mocked(prisma.refreshToken.delete).mockResolvedValue({} as never)

      // No Authorization header at all.
      const response = await logout(
        makeRequest('POST', 'http://localhost/api/auth/logout', {
          body: { refreshToken: 'some-real-token' },
        })
      )
      expect(response.status).toBe(204)
    })
  })

  describe('POST /api/auth/google — malformed/adversarial idToken and tokeninfo responses', () => {
    const originalFetch = global.fetch
    afterEach(() => {
      global.fetch = originalFetch
    })

    it('400s on an empty-string idToken without ever calling the tokeninfo endpoint', async () => {
      const fetchSpy = vi.fn()
      global.fetch = fetchSpy

      const response = await google(
        makeRequest('POST', 'http://localhost/api/auth/google', {
          body: { idToken: '' },
        })
      )
      expect(response.status).toBe(400)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('401s (not 500) when the tokeninfo response has an empty-string email claim', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ email: '' }),
      })

      const response = await google(
        makeRequest('POST', 'http://localhost/api/auth/google', {
          body: { idToken: 'weird-token' },
        })
      )
      expect(response.status).toBe(401)
    })

    it('500s cleanly with the standardized envelope (not an unhandled rejection) when the tokeninfo fetch itself throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

      const response = await google(
        makeRequest('POST', 'http://localhost/api/auth/google', {
          body: { idToken: 'any-token' },
        })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })

    it('401s when tokeninfo returns ok:true with a non-JSON-parseable body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      })

      const response = await google(
        makeRequest('POST', 'http://localhost/api/auth/google', {
          body: { idToken: 'malformed-response-token' },
        })
      )
      // Whatever the exact code, this must not be an unhandled crash — the
      // route's outer catch guarantees a structured envelope either way.
      expect([401, 500]).toContain(response.status)
      const body = await response.json()
      expect(body.error).toBeDefined()
    })
  })

  describe('brute-force interaction with the shared global rate limiter', () => {
    it('repeated failed logins against the same account are throttled by the shared limiter, not exempted', async () => {
      // auth has no per-route rate-limit exemption (confirmed against the
      // live dime-api source in LEARNINGS.md) — simulate the real
      // upsert-and-increment behavior so this test actually exercises the
      // login route's interaction with the limiter, not just a canned mock.
      let count = 0
      vi.mocked(prisma.rateLimitBucket.upsert).mockImplementation((async () => {
        count += 1
        return { count }
      }) as never)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        baseUser({
          passwordHash: 'irrelevant-hash-wrong-password-anyway',
        }) as never
      )

      const attempt = () =>
        login(
          makeRequest('POST', 'http://localhost/api/auth/login', {
            body: { email: 'victim@example.com', password: 'guess' },
          })
        )

      const limit = 100 // default RATE_LIMIT_MAX when the env var is unset
      const statuses: number[] = []
      for (let i = 0; i < limit + 5; i++) {
        const res = await attempt()
        statuses.push(res.status)
      }

      // Every attempt up to the limit is a clean 401 (wrong password), and
      // the ones beyond it are 429 — the account isn't specially exempted,
      // and 401-guessing doesn't get unlimited attempts.
      expect(statuses.slice(0, limit).every((s) => s === 401)).toBe(true)
      expect(statuses.slice(limit).every((s) => s === 429)).toBe(true)
    })
  })

  describe('GET /api/auth/me — tampered-token cases beyond auth.routes.test.ts', () => {
    it('401s (never 500) for an alg:none unsigned token', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      const payload = Buffer.from(
        JSON.stringify({
          userId: 'user_1',
          email: 'alice@example.com',
          exp: Math.floor(Date.now() / 1000) + 900,
        })
      )
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      const token = `${header}.${payload}.`

      const response = await meGet(
        makeRequest('GET', 'http://localhost/api/auth/me', { token })
      )
      expect(response.status).toBe(401)
    })

    it('401s (never 500) for a token with a tampered payload (wrong signature)', async () => {
      const validToken = await signToken()
      const [h, , s] = validToken.split('.')
      const forgedPayload = Buffer.from(
        JSON.stringify({
          userId: 'someone_else',
          email: 'someone_else@example.com',
          exp: Math.floor(Date.now() / 1000) + 900,
        })
      )
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      const tampered = `${h}.${forgedPayload}.${s}`

      const response = await meGet(
        makeRequest('GET', 'http://localhost/api/auth/me', { token: tampered })
      )
      expect(response.status).toBe(401)
    })
  })
})
