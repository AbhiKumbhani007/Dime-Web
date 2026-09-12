// @vitest-environment node
// jose's WebCrypto key handling needs Node's real Uint8Array/CryptoKey realm —
// jsdom's globals are a different realm and fail jose's instanceof checks.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import type { PrismaClient, User } from '@prisma/client'
import {
  toUserProfile,
  issueTokens,
  registerUser,
  loginUser,
  refreshTokens,
  logoutUser,
  getMe,
  updateMe,
  updatePassword,
  deleteMe,
  googleAuth,
} from './auth.service'

const TEST_SECRET = 'test-jwt-access-secret-at-least-32-characters-long'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user_1',
    email: 'alice@example.com',
    name: 'Alice',
    passwordHash: null,
    theme: 'system',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as User
}

function createMockPrisma() {
  return {
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
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    category: {
      createMany: vi.fn(),
    },
  } as unknown as PrismaClient & {
    user: {
      findUnique: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
    refreshToken: {
      create: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
      deleteMany: ReturnType<typeof vi.fn>
      updateMany: ReturnType<typeof vi.fn>
    }
    category: { createMany: ReturnType<typeof vi.fn> }
  }
}

describe('auth service', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('toUserProfile', () => {
    it('maps the Prisma User shape to the flat UserProfile, ISO-stringifying createdAt', () => {
      const user = makeUser({
        createdAt: new Date('2026-03-04T05:06:07.000Z'),
      })
      expect(toUserProfile(user)).toEqual({
        id: 'user_1',
        email: 'alice@example.com',
        name: 'Alice',
        theme: 'system',
        createdAt: '2026-03-04T05:06:07.000Z',
      })
    })
  })

  describe('issueTokens', () => {
    it('signs a jose-verifiable HS256 access token with {userId,email} and a 15-minute exp', async () => {
      const prisma = createMockPrisma()
      prisma.refreshToken.create.mockResolvedValue({})
      const user = makeUser()
      const nowSec = Math.floor(Date.now() / 1000)

      const tokens = await issueTokens(prisma, user)

      const { payload, protectedHeader } = await jwtVerify(
        tokens.accessToken,
        new TextEncoder().encode(TEST_SECRET),
        { algorithms: ['HS256'] }
      )
      expect(protectedHeader.alg).toBe('HS256')
      expect(payload.userId).toBe(user.id)
      expect(payload.email).toBe(user.email)
      expect(payload.exp).toBeGreaterThanOrEqual(nowSec + 15 * 60 - 5)
      expect(payload.exp).toBeLessThanOrEqual(nowSec + 15 * 60 + 5)
    })

    it('rejects the access token against jwtVerify with the wrong secret', async () => {
      const prisma = createMockPrisma()
      prisma.refreshToken.create.mockResolvedValue({})
      const tokens = await issueTokens(prisma, makeUser())

      await expect(
        jwtVerify(
          tokens.accessToken,
          new TextEncoder().encode('a-completely-different-secret-of-32'),
          { algorithms: ['HS256'] }
        )
      ).rejects.toThrow()
    })

    it('persists an opaque crypto.randomUUID refresh token with a 30-day expiry', async () => {
      const prisma = createMockPrisma()
      prisma.refreshToken.create.mockResolvedValue({})
      const user = makeUser()
      const before = Date.now()

      const tokens = await issueTokens(prisma, user)

      expect(tokens.refreshToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: expect.any(Date),
        },
      })
      const expiresAt = prisma.refreshToken.create.mock.calls[0][0].data
        .expiresAt as Date
      const diffDays = (expiresAt.getTime() - before) / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeGreaterThan(29.9)
      expect(diffDays).toBeLessThan(30.1)
    })
  })

  describe('registerUser', () => {
    it('rejects a duplicate email with a 409 httpError, never creating a user', async () => {
      const prisma = createMockPrisma()
      prisma.user.findUnique.mockResolvedValue(makeUser())

      await expect(
        registerUser(prisma, 'alice@example.com', 'password123')
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Email already registered',
      })
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('hashes with bcrypt, seeds default categories, and issues a token pair', async () => {
      const prisma = createMockPrisma()
      prisma.user.findUnique.mockResolvedValue(null)
      const created = makeUser({ id: 'user_new' })
      prisma.user.create.mockResolvedValue(created)
      prisma.refreshToken.create.mockResolvedValue({})
      prisma.category.createMany.mockResolvedValue({ count: 18 })

      const { tokens, user } = await registerUser(
        prisma,
        'alice@example.com',
        'password123',
        'Alice'
      )

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'alice@example.com',
          passwordHash: expect.any(String),
          name: 'Alice',
        },
      })
      const passwordHash = prisma.user.create.mock.calls[0][0].data
        .passwordHash as string
      expect(passwordHash).not.toBe('password123')
      expect(await bcrypt.compare('password123', passwordHash)).toBe(true)
      expect(prisma.category.createMany).toHaveBeenCalledTimes(1)
      expect(tokens.accessToken).toEqual(expect.any(String))
      expect(user).toEqual(toUserProfile(created))
    })
  })

  describe('loginUser', () => {
    it('rejects an unknown email with a 401 httpError', async () => {
      const prisma = createMockPrisma()
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(
        loginUser(prisma, 'ghost@example.com', 'password123')
      ).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid email or password',
      })
    })

    it('rejects a user with no passwordHash (Google-only account) with 401', async () => {
      const prisma = createMockPrisma()
      prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: null }))

      await expect(
        loginUser(prisma, 'alice@example.com', 'password123')
      ).rejects.toMatchObject({ statusCode: 401 })
    })

    it('rejects a wrong password with a 401 httpError', async () => {
      const prisma = createMockPrisma()
      const hash = await bcrypt.hash('correct-password', 10)
      prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: hash }))

      await expect(
        loginUser(prisma, 'alice@example.com', 'wrong-password')
      ).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid email or password',
      })
    })

    it('issues a token pair for a correct password', async () => {
      const prisma = createMockPrisma()
      const hash = await bcrypt.hash('correct-password', 10)
      const user = makeUser({ passwordHash: hash })
      prisma.user.findUnique.mockResolvedValue(user)
      prisma.refreshToken.create.mockResolvedValue({})

      const result = await loginUser(
        prisma,
        'alice@example.com',
        'correct-password'
      )

      expect(result.tokens.accessToken).toEqual(expect.any(String))
      expect(result.user).toEqual(toUserProfile(user))
    })
  })

  describe('refreshTokens', () => {
    it('rejects an unknown token with a 401 httpError', async () => {
      const prisma = createMockPrisma()
      prisma.refreshToken.findUnique.mockResolvedValue(null)

      await expect(
        refreshTokens(prisma, 'totally-invalid-token')
      ).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid or expired refresh token',
      })
    })

    it('rejects an expired token with a 401 httpError, without attempting to claim it', async () => {
      const prisma = createMockPrisma()
      prisma.refreshToken.findUnique.mockResolvedValue({
        token: 'old-token',
        userId: 'user_1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        user: makeUser(),
      })

      await expect(refreshTokens(prisma, 'old-token')).rejects.toMatchObject({
        statusCode: 401,
      })
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled()
    })

    it('rotates: atomically claims the old token (sets revokedAt) and issues a new pair, without deleting the old row', async () => {
      const prisma = createMockPrisma()
      const user = makeUser()
      prisma.refreshToken.findUnique.mockResolvedValue({
        token: 'old-token',
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: null,
        user,
      })
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 })
      prisma.refreshToken.create.mockResolvedValue({})

      const newTokens = await refreshTokens(prisma, 'old-token')

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { token: 'old-token', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      })
      expect(prisma.refreshToken.delete).not.toHaveBeenCalled()
      expect(newTokens.refreshToken).not.toBe('old-token')
      expect(newTokens.accessToken).toEqual(expect.any(String))
    })

    it('rejects reusing an already-rotated token (revokedAt already set) and revokes the whole session family', async () => {
      // Simulates rotation at the storage level: once rotated, the row still
      // exists but with revokedAt set (no longer deleted, see auth.service.ts).
      const prisma = createMockPrisma()
      const user = makeUser()
      prisma.refreshToken.findUnique.mockResolvedValue({
        token: 'old-token',
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: new Date(),
        user,
      })

      await expect(refreshTokens(prisma, 'old-token')).rejects.toMatchObject({
        statusCode: 401,
      })
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: user.id },
      })
      // Reuse of an already-revoked token is a theft signal, not a race —
      // never reaches the atomic-claim step.
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled()
    })

    it('rejects an unknown token (no row at all) without cascading — nothing to revoke', async () => {
      const prisma = createMockPrisma()
      prisma.refreshToken.findUnique.mockResolvedValue(null)

      await expect(
        refreshTokens(prisma, 'never-existed')
      ).rejects.toMatchObject({ statusCode: 401 })

      // The unconditional opportunistic cleanup call is fine (it's scoped to
      // old revokedAt rows, not this user) — what must never happen is the
      // userId-scoped cascade delete.
      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalledWith({
        where: { userId: expect.anything() },
      })
    })

    it('opportunistically deletes revoked rows older than the retention window on every call', async () => {
      const prisma = createMockPrisma()
      prisma.refreshToken.findUnique.mockResolvedValue(null)

      await expect(
        refreshTokens(prisma, 'whatever')
      ).rejects.toMatchObject({ statusCode: 401 })

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { revokedAt: { lt: expect.any(Date) } },
      })
    })
  })

  describe('logoutUser', () => {
    it('deletes the refresh token when it exists', async () => {
      const prisma = createMockPrisma()
      prisma.refreshToken.delete.mockResolvedValue({})

      await logoutUser(prisma, 'some-token')

      expect(prisma.refreshToken.delete).toHaveBeenCalledWith({
        where: { token: 'some-token' },
      })
    })

    it('is idempotent — resolves without throwing when the token is unknown', async () => {
      const prisma = createMockPrisma()
      prisma.refreshToken.delete.mockRejectedValue(
        Object.assign(new Error('Record to delete does not exist.'), {
          code: 'P2025',
        })
      )

      await expect(logoutUser(prisma, 'never-existed')).resolves.toBeUndefined()
    })
  })

  describe('getMe', () => {
    it('returns null when the user no longer exists', async () => {
      const prisma = createMockPrisma()
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(getMe(prisma, 'user_deleted')).resolves.toBeNull()
    })

    it('returns the mapped profile when found', async () => {
      const prisma = createMockPrisma()
      const user = makeUser()
      prisma.user.findUnique.mockResolvedValue(user)

      await expect(getMe(prisma, user.id)).resolves.toEqual(toUserProfile(user))
    })
  })

  describe('updateMe', () => {
    it('updates and returns the mapped profile', async () => {
      const prisma = createMockPrisma()
      const updated = makeUser({ name: 'NewName' })
      prisma.user.update.mockResolvedValue(updated)

      const result = await updateMe(prisma, 'user_1', { name: 'NewName' })

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { name: 'NewName' },
      })
      expect(result).toEqual(toUserProfile(updated))
    })
  })

  describe('updatePassword', () => {
    it('throws a 404 httpError when the user does not exist', async () => {
      const prisma = createMockPrisma()
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(
        updatePassword(prisma, 'ghost', 'old', 'newpassword')
      ).rejects.toMatchObject({ statusCode: 404 })
    })

    it('rejects a wrong old password with a 400 httpError, leaving the hash unchanged', async () => {
      const prisma = createMockPrisma()
      const hash = await bcrypt.hash('oldpassword', 10)
      prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: hash }))

      await expect(
        updatePassword(prisma, 'user_1', 'not-the-old-one', 'brandnewpw')
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Current password is incorrect',
      })
      expect(prisma.user.update).not.toHaveBeenCalled()
      // A rejected attempt must never revoke real sessions.
      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled()
    })

    it('re-hashes and stores the new password on a correct old password', async () => {
      const prisma = createMockPrisma()
      const hash = await bcrypt.hash('oldpassword', 10)
      prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: hash }))
      prisma.user.update.mockResolvedValue(makeUser())

      await updatePassword(prisma, 'user_1', 'oldpassword', 'brandnewpw')

      const newHash = prisma.user.update.mock.calls[0][0].data
        .passwordHash as string
      expect(await bcrypt.compare('brandnewpw', newHash)).toBe(true)
    })

    it('revokes every refresh-token row for the user after a successful change, forcing every device to re-login', async () => {
      const prisma = createMockPrisma()
      const hash = await bcrypt.hash('oldpassword', 10)
      prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: hash }))
      prisma.user.update.mockResolvedValue(makeUser())
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 })

      await updatePassword(prisma, 'user_1', 'oldpassword', 'brandnewpw')

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user_1' },
      })
    })

    it('the old refresh token 401s on the next /api/auth/refresh call, since its row was deleted', async () => {
      const prisma = createMockPrisma()
      const hash = await bcrypt.hash('oldpassword', 10)
      prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: hash }))
      prisma.user.update.mockResolvedValue(makeUser())
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })

      await updatePassword(prisma, 'user_1', 'oldpassword', 'brandnewpw')

      // Simulates the real DB post-deleteMany: the row is gone.
      prisma.refreshToken.findUnique.mockResolvedValue(null)
      await expect(
        refreshTokens(prisma, 'the-old-refresh-token')
      ).rejects.toMatchObject({ statusCode: 401 })
    })

    it('does NOT invalidate an access token issued before the change — access tokens are short-lived (15m), stateless JWTs with no server-side blocklist, by design', async () => {
      // Documents the accepted tradeoff explicitly (see auth.service.ts's
      // updatePassword comment and docs/api.md's me/password row): an
      // access token minted moments before a password change keeps working
      // until its own natural expiry. Proven directly rather than by
      // waiting out the real 15-minute TTL — updatePassword never touches
      // anything the access token's own signature/exp verification depends
      // on (it only writes User.passwordHash and deletes RefreshToken rows),
      // so a token issued beforehand must still verify identically after.
      const prisma = createMockPrisma()
      const hash = await bcrypt.hash('oldpassword', 10)
      const user = makeUser({ passwordHash: hash })
      prisma.user.findUnique.mockResolvedValue(user)
      prisma.user.update.mockResolvedValue(makeUser())
      prisma.refreshToken.create.mockResolvedValue({})
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })

      const { accessToken } = await issueTokens(prisma, user)

      await updatePassword(prisma, user.id, 'oldpassword', 'brandnewpw')

      const { payload } = await jwtVerify(
        accessToken,
        new TextEncoder().encode(TEST_SECRET),
        { algorithms: ['HS256'] }
      )
      expect(payload.userId).toBe(user.id)
    })
  })

  describe('deleteMe', () => {
    it('deletes the user by id', async () => {
      const prisma = createMockPrisma()
      prisma.user.delete.mockResolvedValue(makeUser())

      await deleteMe(prisma, 'user_1')

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user_1' },
      })
    })
  })

  describe('googleAuth', () => {
    const originalFetch = global.fetch

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('rejects with 401 when tokeninfo returns a non-200 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })
      const prisma = createMockPrisma()

      await expect(googleAuth(prisma, 'bad-id-token')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid Google ID token',
      })
    })

    it('rejects with 401 when the response is missing the email claim', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ name: 'No Email' }),
      })
      const prisma = createMockPrisma()

      await expect(googleAuth(prisma, 'token-no-email')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Google token missing email claim',
      })
    })

    it('creates a new passwordless user and seeds default categories on first sign-in', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ email: 'new@example.com', name: 'New Person' }),
      })
      const prisma = createMockPrisma()
      prisma.user.findUnique.mockResolvedValue(null)
      const created = makeUser({
        id: 'user_google',
        email: 'new@example.com',
        name: 'New Person',
        passwordHash: null,
      })
      prisma.user.create.mockResolvedValue(created)
      prisma.refreshToken.create.mockResolvedValue({})
      prisma.category.createMany.mockResolvedValue({ count: 18 })

      const result = await googleAuth(prisma, 'good-id-token')

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'new@example.com',
          name: 'New Person',
          passwordHash: null,
        },
      })
      expect(prisma.category.createMany).toHaveBeenCalledTimes(1)
      expect(result.user).toEqual(toUserProfile(created))
    })

    it('creates a new user with name: null when the tokeninfo response omits the name claim', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ email: 'noname@example.com' }),
      })
      const prisma = createMockPrisma()
      prisma.user.findUnique.mockResolvedValue(null)
      prisma.user.create.mockResolvedValue(
        makeUser({ email: 'noname@example.com', name: null }) as never
      )
      prisma.refreshToken.create.mockResolvedValue({})
      prisma.category.createMany.mockResolvedValue({ count: 18 })

      await googleAuth(prisma, 'good-id-token')

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'noname@example.com',
          name: null,
          passwordHash: null,
        },
      })
    })

    it('reuses an existing user by email on repeat sign-in, without re-seeding categories', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ email: 'alice@example.com' }),
      })
      const prisma = createMockPrisma()
      const existing = makeUser()
      prisma.user.findUnique.mockResolvedValue(existing)
      prisma.refreshToken.create.mockResolvedValue({})

      const result = await googleAuth(prisma, 'good-id-token')

      expect(prisma.user.create).not.toHaveBeenCalled()
      expect(prisma.category.createMany).not.toHaveBeenCalled()
      expect(result.user).toEqual(toUserProfile(existing))
    })
  })
})
