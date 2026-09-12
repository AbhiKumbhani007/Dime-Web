// @vitest-environment node
// jose's WebCrypto key handling needs Node's real Uint8Array/CryptoKey realm —
// jsdom's globals are a different realm and fail jose's instanceof checks.
//
// Coverage for the reuse-detection/session-family-revocation fix added to
// refreshTokens() (see auth.service.ts): replaying a refresh token that has
// already been rotated out is now treated as a possible theft signal and
// revokes every RefreshToken row for that user, not just the replayed one —
// including the row the legitimate rotation itself just created. This is
// deliberately narrower than lib/server/auth/auth.concurrency.live.test.ts's
// real-Postgres race test: that one proves the *honest concurrent double-fire*
// case (both callers see revokedAt: null) does NOT cascade. This file proves
// the *stale-replay* case (the reused token is already marked revokedAt) DOES
// cascade, and does so deterministically via a scripted mock rather than
// real DB timing.
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
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    category: { createMany: vi.fn() },
  } as unknown as PrismaClient & {
    refreshToken: {
      create: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
      deleteMany: ReturnType<typeof vi.fn>
      updateMany: ReturnType<typeof vi.fn>
    }
  }
}

describe('refreshTokens — reuse of a rotated-out token revokes the whole session family', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rotate once, then replay the pre-rotation token → 401, AND the legitimately-issued new token is now also rejected', async () => {
    const prisma = createMockPrisma()
    const user = makeUser()
    const oldToken = 'session-original-token'

    // Call 1: a normal, legitimate rotation of `oldToken`.
    prisma.refreshToken.findUnique.mockResolvedValueOnce({
      token: oldToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: null,
      user,
    })
    prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 1 })

    const firstRotation = await refreshTokens(prisma, oldToken)
    expect(firstRotation.refreshToken).not.toBe(oldToken)
    expect(firstRotation.accessToken).toEqual(expect.any(String))
    const newToken = firstRotation.refreshToken

    // Call 2: replay the ORIGINAL pre-rotation token. In the real DB this
    // row still exists (rotation no longer deletes it) but now carries the
    // revokedAt stamp call 1 set — exactly the "already rotated out before
    // this request even read it" theft signal.
    prisma.refreshToken.findUnique.mockResolvedValueOnce({
      token: oldToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: new Date(),
      user,
    })

    await expect(refreshTokens(prisma, oldToken)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired refresh token',
    })

    // Proves the cascade: every row for this user was deleted, not just the
    // replayed one.
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    })

    // Call 3: the brand-new token that call 1's HONEST rotation issued is
    // now also rejected — its row was swept up by call 2's cascade delete.
    // This is the whole point of the fix: a stolen-and-replayed old token
    // kills the legitimate session too, so the real user is forced to
    // re-authenticate rather than silently keep trusting a token an
    // attacker has also seen.
    prisma.refreshToken.findUnique.mockResolvedValueOnce(null)

    await expect(refreshTokens(prisma, newToken)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired refresh token',
    })
  })

  it('does NOT cascade for the honest concurrent-race case — only a token already carrying revokedAt triggers it', async () => {
    // Companion assertion to the scenario above: losing the atomic-claim
    // race (both callers observed revokedAt: null) must stay a plain 401,
    // never a cascade — that's what auth.concurrency.live.test.ts proves
    // against a real database. Re-asserted here at the unit level so the
    // distinction is pinned down in one place alongside the reuse case.
    const prisma = createMockPrisma()
    const user = makeUser()
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 'raced-token',
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: null,
      user,
    })
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 })

    await expect(refreshTokens(prisma, 'raced-token')).rejects.toMatchObject({
      statusCode: 401,
    })

    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalledWith({
      where: { userId: user.id },
    })
  })
})
