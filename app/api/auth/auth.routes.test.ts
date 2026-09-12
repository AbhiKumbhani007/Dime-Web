// @vitest-environment node
// authenticate()/auth.service.ts import jose, which needs Node's real
// Uint8Array/CryptoKey realm — jsdom's globals are a different realm and
// fail jose's instanceof checks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { POST as register } from './register/route'
import { POST as login } from './login/route'
import { POST as refresh } from './refresh/route'
import { POST as logout } from './logout/route'
import { GET as meGet, PATCH as mePatch, DELETE as meDelete } from './me/route'
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

describe('auth routes', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.clearAllMocks()
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 1,
    } as never)
    vi.mocked(prisma.category.createMany).mockResolvedValue({
      count: 18,
    } as never)
    // refreshTokens()'s opportunistic cleanup (deleteMany) and atomic-claim
    // (updateMany) calls run on every call — default to "nothing stale to
    // clean up" / "won the claim" so tests that don't care about these
    // mechanics don't need to mock them individually. Tests that DO care
    // (rotation, reuse) override these per-test below.
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

  describe('POST /api/auth/register', () => {
    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)

      const response = await register(
        makeRequest('POST', 'http://localhost/api/auth/register', {
          body: { email: 'a@example.com', password: 'password123' },
        })
      )
      expect(response.status).toBe(429)
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('400s (not 500) on a malformed JSON body', async () => {
      const request = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      })
      const response = await register(request)
      expect(response.status).toBe(400)
    })

    it('400s with VALIDATION_ERROR for a password under 8 characters', async () => {
      const response = await register(
        makeRequest('POST', 'http://localhost/api/auth/register', {
          body: { email: 'a@example.com', password: 'short' },
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('409s with CONFLICT on a duplicate email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser() as never)

      const response = await register(
        makeRequest('POST', 'http://localhost/api/auth/register', {
          body: { email: 'alice@example.com', password: 'password123' },
        })
      )
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'CONFLICT',
        message: 'Email already registered',
      })
    })

    it('201s with the flat {accessToken,refreshToken,user} envelope, no wrapper', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.user.create).mockResolvedValue(baseUser() as never)
      vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never)

      const response = await register(
        makeRequest('POST', 'http://localhost/api/auth/register', {
          body: {
            email: 'alice@example.com',
            password: 'password123',
            name: 'Alice',
          },
        })
      )
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body).toHaveProperty('accessToken')
      expect(body).toHaveProperty('refreshToken')
      expect(body.user).toMatchObject({
        id: 'user_1',
        email: 'alice@example.com',
      })
      expect(body).not.toHaveProperty('tokens')
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.user.create).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await register(
        makeRequest('POST', 'http://localhost/api/auth/register', {
          body: { email: 'alice@example.com', password: 'password123' },
        })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('POST /api/auth/login', () => {
    it('401s on an unknown email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      const response = await login(
        makeRequest('POST', 'http://localhost/api/auth/login', {
          body: { email: 'ghost@example.com', password: 'password123' },
        })
      )
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      })
    })

    it('401s on a wrong password, never 403', async () => {
      const bcrypt = (await import('bcryptjs')).default
      const hash = await bcrypt.hash('correct-password', 10)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        baseUser({ passwordHash: hash }) as never
      )

      const response = await login(
        makeRequest('POST', 'http://localhost/api/auth/login', {
          body: { email: 'alice@example.com', password: 'wrong-password' },
        })
      )
      expect(response.status).toBe(401)
    })

    it('200s with the flat {accessToken,refreshToken,user} envelope on success', async () => {
      const bcrypt = (await import('bcryptjs')).default
      const hash = await bcrypt.hash('correct-password', 10)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        baseUser({ passwordHash: hash }) as never
      )
      vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never)

      const response = await login(
        makeRequest('POST', 'http://localhost/api/auth/login', {
          body: { email: 'alice@example.com', password: 'correct-password' },
        })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('accessToken')
      expect(body).toHaveProperty('refreshToken')
      expect(body.user.email).toBe('alice@example.com')
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('401s on an unknown/invalid token', async () => {
      vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(null)

      const response = await refresh(
        makeRequest('POST', 'http://localhost/api/auth/refresh', {
          body: { refreshToken: 'totally-invalid-token' },
        })
      )
      expect(response.status).toBe(401)
    })

    it('rotates: a second call with the original token 401s after the first succeeds', async () => {
      const user = baseUser()
      vi.mocked(prisma.refreshToken.findUnique)
        .mockResolvedValueOnce({
          token: 'old-token',
          userId: 'user_1',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          revokedAt: null,
          user,
        } as never)
        // Real-DB behavior post-rotation: the row is kept, now with
        // revokedAt set (see the reuse-detection fix in auth.service.ts) —
        // no longer deleted outright.
        .mockResolvedValueOnce({
          token: 'old-token',
          userId: 'user_1',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          revokedAt: new Date(),
          user,
        } as never)
      vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({
        count: 1,
      } as never)
      vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never)

      const first = await refresh(
        makeRequest('POST', 'http://localhost/api/auth/refresh', {
          body: { refreshToken: 'old-token' },
        })
      )
      expect(first.status).toBe(200)
      const firstBody = await first.json()
      expect(firstBody.refreshToken).not.toBe('old-token')

      const second = await refresh(
        makeRequest('POST', 'http://localhost/api/auth/refresh', {
          body: { refreshToken: 'old-token' },
        })
      )
      expect(second.status).toBe(401)
      // Reuse of the already-rotated token also cascades: the whole
      // session family (this user's rows) is revoked, per Fix 1.
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user_1' },
      })
    })
  })

  describe('POST /api/auth/logout', () => {
    it('400s with VALIDATION_ERROR on a missing body', async () => {
      const response = await logout(
        makeRequest('POST', 'http://localhost/api/auth/logout', { body: {} })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('204s on a valid token, with no body', async () => {
      vi.mocked(prisma.refreshToken.delete).mockResolvedValue({} as never)

      const response = await logout(
        makeRequest('POST', 'http://localhost/api/auth/logout', {
          body: { refreshToken: 'some-token' },
        })
      )
      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
    })

    it('is idempotent — a second call with the same, now-invalidated token still 204s', async () => {
      vi.mocked(prisma.refreshToken.delete)
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce(
          Object.assign(new Error('Record to delete does not exist.'), {
            code: 'P2025',
          })
        )

      const first = await logout(
        makeRequest('POST', 'http://localhost/api/auth/logout', {
          body: { refreshToken: 'some-token' },
        })
      )
      expect(first.status).toBe(204)

      const second = await logout(
        makeRequest('POST', 'http://localhost/api/auth/logout', {
          body: { refreshToken: 'some-token' },
        })
      )
      expect(second.status).toBe(204)
    })
  })

  describe('GET /api/auth/me', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await meGet(
        makeRequest('GET', 'http://localhost/api/auth/me')
      )
      expect(response.status).toBe(401)
    })

    it('401s for a malformed/truncated JWT', async () => {
      const response = await meGet(
        makeRequest('GET', 'http://localhost/api/auth/me', {
          token: 'not-a-real-jwt',
        })
      )
      expect(response.status).toBe(401)
    })

    it('401s for a token signed with the wrong secret', async () => {
      const token = await signToken(undefined, {
        secret: 'a-completely-different-secret-of-32',
      })
      const response = await meGet(
        makeRequest('GET', 'http://localhost/api/auth/me', { token })
      )
      expect(response.status).toBe(401)
    })

    it('401s for an expired access token', async () => {
      const token = await signToken(undefined, { expiresIn: '-1s' })
      const response = await meGet(
        makeRequest('GET', 'http://localhost/api/auth/me', { token })
      )
      expect(response.status).toBe(401)
    })

    it('404s when the token is valid but the user row no longer exists', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      const token = await signToken()

      const response = await meGet(
        makeRequest('GET', 'http://localhost/api/auth/me', { token })
      )
      expect(response.status).toBe(404)
    })

    it('200s with the flat UserProfile for a valid token', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser() as never)
      const token = await signToken()

      const response = await meGet(
        makeRequest('GET', 'http://localhost/api/auth/me', { token })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toMatchObject({ id: 'user_1', email: 'alice@example.com' })
    })
  })

  describe('PATCH /api/auth/me', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await mePatch(
        makeRequest('PATCH', 'http://localhost/api/auth/me', {
          body: { name: 'New' },
        })
      )
      expect(response.status).toBe(401)
      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('200s with the updated flat UserProfile', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue(
        baseUser({ name: 'NewName' }) as never
      )
      const token = await signToken()

      const response = await mePatch(
        makeRequest('PATCH', 'http://localhost/api/auth/me', {
          token,
          body: { name: 'NewName' },
        })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.name).toBe('NewName')
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { name: 'NewName' },
      })
    })
  })

  describe('DELETE /api/auth/me', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await meDelete(
        makeRequest('DELETE', 'http://localhost/api/auth/me')
      )
      expect(response.status).toBe(401)
      expect(prisma.user.delete).not.toHaveBeenCalled()
    })

    it('204s and calls prisma.user.delete for a valid token', async () => {
      vi.mocked(prisma.user.delete).mockResolvedValue(baseUser() as never)
      const token = await signToken()

      const response = await meDelete(
        makeRequest('DELETE', 'http://localhost/api/auth/me', { token })
      )
      expect(response.status).toBe(204)
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user_1' },
      })
    })
  })

  describe('PATCH /api/auth/me/password', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await passwordPatch(
        makeRequest('PATCH', 'http://localhost/api/auth/me/password', {
          body: { oldPassword: 'old', newPassword: 'brandnewpw' },
        })
      )
      expect(response.status).toBe(401)
    })

    it('400s with VALIDATION_ERROR when newPassword is under 8 characters', async () => {
      const token = await signToken()
      const response = await passwordPatch(
        makeRequest('PATCH', 'http://localhost/api/auth/me/password', {
          token,
          body: { oldPassword: 'oldpassword', newPassword: 'short' },
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400s with VALIDATION_ERROR on a wrong old password, and never updates', async () => {
      const bcrypt = (await import('bcryptjs')).default
      const hash = await bcrypt.hash('oldpassword', 10)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        baseUser({ passwordHash: hash }) as never
      )
      const token = await signToken()

      const response = await passwordPatch(
        makeRequest('PATCH', 'http://localhost/api/auth/me/password', {
          token,
          body: { oldPassword: 'not-the-old-one', newPassword: 'brandnewpw' },
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Current password is incorrect',
      })
      expect(prisma.user.update).not.toHaveBeenCalled()
    })

    it('200s with an empty object body on success', async () => {
      const bcrypt = (await import('bcryptjs')).default
      const hash = await bcrypt.hash('oldpassword', 10)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(
        baseUser({ passwordHash: hash }) as never
      )
      vi.mocked(prisma.user.update).mockResolvedValue(baseUser() as never)
      const token = await signToken()

      const response = await passwordPatch(
        makeRequest('PATCH', 'http://localhost/api/auth/me/password', {
          token,
          body: { oldPassword: 'oldpassword', newPassword: 'brandnewpw' },
        })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({})
    })
  })

  describe('POST /api/auth/google', () => {
    const originalFetch = global.fetch
    afterEach(() => {
      global.fetch = originalFetch
    })

    it('400s with VALIDATION_ERROR when idToken is missing', async () => {
      const response = await google(
        makeRequest('POST', 'http://localhost/api/auth/google', {
          body: {},
        })
      )
      expect(response.status).toBe(400)
    })

    it('401s when tokeninfo returns a non-200 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })

      const response = await google(
        makeRequest('POST', 'http://localhost/api/auth/google', {
          body: { idToken: 'bad-token' },
        })
      )
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error.message).toBe('Invalid Google ID token')
    })

    it('401s when the tokeninfo response is missing the email claim', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ name: 'No Email' }),
      })

      const response = await google(
        makeRequest('POST', 'http://localhost/api/auth/google', {
          body: { idToken: 'token-no-email' },
        })
      )
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error.message).toBe('Google token missing email claim')
    })

    it('200s with the flat {accessToken,refreshToken,user} envelope, reusing an existing user', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ email: 'alice@example.com' }),
      })
      vi.mocked(prisma.user.findUnique).mockResolvedValue(baseUser() as never)
      vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as never)

      const response = await google(
        makeRequest('POST', 'http://localhost/api/auth/google', {
          body: { idToken: 'good-token' },
        })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('accessToken')
      expect(body.user.email).toBe('alice@example.com')
      expect(prisma.user.create).not.toHaveBeenCalled()
    })
  })
})
