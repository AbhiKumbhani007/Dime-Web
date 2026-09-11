// @vitest-environment node
// jose's WebCrypto key handling needs Node's real Uint8Array/CryptoKey realm —
// jsdom's globals are a different realm and fail jose's instanceof checks.
//
// Targeted investigation of refresh-token reuse semantics: does reusing a
// rotated-out refresh token trigger any revocation cascade (killing the
// user's *other* active sessions, the way stolen-refresh-token defenses
// typically work), or does it just reject the stale token in isolation?
// Neither tdd.md nor LEARNINGS.md documents a cascade as intentional, so
// this pins down the actual behavior rather than assuming either way.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PrismaClient, User } from '@prisma/client'
import { refreshTokens } from './auth.service'

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
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    category: { createMany: vi.fn() },
  } as unknown as PrismaClient & {
    refreshToken: {
      create: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
      deleteMany: ReturnType<typeof vi.fn>
      findMany: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      updateMany: ReturnType<typeof vi.fn>
    }
  }
}

describe('refreshTokens — reuse-detection / revocation-cascade behavior', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects reuse of an already-rotated token with a clean 401 (findUnique returns null post-rotation)', async () => {
    const prisma = createMockPrisma()
    const user = makeUser()
    // Simulates the real DB post-rotation: the old row is gone.
    prisma.refreshToken.findUnique.mockResolvedValue(null)

    await expect(
      refreshTokens(prisma, 'stolen-old-token')
    ).rejects.toMatchObject({ statusCode: 401 })
    void user
  })

  it('does NOT call any user-scoped bulk revocation (deleteMany/updateMany) when a stale token is reused', async () => {
    // This is the key finding: reuse of a stale token is rejected in
    // isolation. There is no reuse-detection cascade that revokes the rest
    // of the user's sessions (a common "stolen refresh token" defense) —
    // confirmed by asserting the service never reaches for a bulk
    // user-scoped delete/update on the refreshToken table anywhere in this
    // code path.
    const prisma = createMockPrisma()
    prisma.refreshToken.findUnique.mockResolvedValue(null)

    await expect(
      refreshTokens(prisma, 'stolen-old-token')
    ).rejects.toMatchObject({ statusCode: 401 })

    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled()
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled()
    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled()
  })

  it("a successful rotation only deletes the exact rotated token, never touches the user's other sessions", async () => {
    // A user with two active sessions (two refresh-token rows). Rotating
    // one must not disturb the other.
    const prisma = createMockPrisma()
    const user = makeUser()
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 'session-A-token',
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      user,
    })
    prisma.refreshToken.delete.mockResolvedValue({})
    prisma.refreshToken.create.mockResolvedValue({})

    await refreshTokens(prisma, 'session-A-token')

    expect(prisma.refreshToken.delete).toHaveBeenCalledTimes(1)
    expect(prisma.refreshToken.delete).toHaveBeenCalledWith({
      where: { token: 'session-A-token' },
    })
    // Session B's token was never referenced, queried, or touched.
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled()
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled()
  })

  it('a genuine race (two callers both pass the findUnique check) 401s the loser instead of 500ing', async () => {
    // Regression test for a real bug found via live concurrent-request
    // testing: two overlapping refreshes with the same token both see the
    // row via findUnique before either's delete commits. The second delete
    // throws Prisma P2025 ("record to delete does not exist"); the service
    // must translate that into the documented 401, not let it surface as an
    // uncaught 500.
    const prisma = createMockPrisma()
    const user = makeUser()
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 'raced-token',
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      user,
    })
    prisma.refreshToken.delete.mockRejectedValue(
      Object.assign(new Error('Record to delete does not exist.'), {
        code: 'P2025',
      })
    )

    await expect(refreshTokens(prisma, 'raced-token')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired refresh token',
    })
  })

  it('re-throws a delete error with an unrelated Prisma code as-is (not silently swallowed as 401)', async () => {
    const prisma = createMockPrisma()
    const user = makeUser()
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 'some-token',
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      user,
    })
    const dbDown = Object.assign(new Error('Connection terminated'), {
      code: 'P1001',
    })
    prisma.refreshToken.delete.mockRejectedValue(dbDown)

    await expect(refreshTokens(prisma, 'some-token')).rejects.toBe(dbDown)
  })
})
