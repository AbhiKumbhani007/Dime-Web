// @vitest-environment node
// jose's WebCrypto key handling needs Node's real Uint8Array/CryptoKey realm —
// jsdom's globals are a different realm and fail jose's instanceof checks.
//
// Targeted investigation of refresh-token reuse semantics, written before a
// reuse-detection cascade was a decided feature (see its original framing
// below, preserved for history). At the time, neither tdd.md nor
// LEARNINGS.md documented a cascade as intentional, and the answer this file
// found was "no — a stale token is rejected in isolation, no cascade".
//
// That has since changed: a security/robustness pass explicitly added
// session-family revocation for token reuse (see auth.service.ts's
// refreshTokens and lib/server/auth/auth.refresh-reuse.security.test.ts for
// full coverage of the new cascade). This file is updated in place — rather
// than deleted — to keep covering the one sub-case the cascade does NOT
// apply to: a token that doesn't exist in the RefreshToken table *at all*
// (never issued, already cleaned up, or already fully revoked-and-purged).
// There is nothing to cascade when the row itself is already gone; the
// cascade only fires when a row exists with revokedAt already set (a stale
// rotated-out token being replayed), which is exactly the scenario the
// mechanism changed for — rotation no longer deletes the old row, it marks
// revokedAt and keeps it around specifically so replay can be detected.
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
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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

// Asserts the userId-scoped cascade delete (the "revoke this user's whole
// session family" call) never happened, tolerating the unconditional,
// differently-scoped opportunistic cleanup call (revokedAt-age-scoped) that
// now runs on every refreshTokens() call regardless of outcome.
function expectNoCascade(prisma: ReturnType<typeof createMockPrisma>) {
  expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalledWith({
    where: { userId: expect.anything() },
  })
}

describe('refreshTokens — reuse-detection / revocation-cascade behavior', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a token with no row at all with a clean 401 (never issued, or already fully cleaned up/revoked)', async () => {
    const prisma = createMockPrisma()
    const user = makeUser()
    prisma.refreshToken.findUnique.mockResolvedValue(null)

    await expect(
      refreshTokens(prisma, 'stolen-old-token')
    ).rejects.toMatchObject({ statusCode: 401 })
    void user
  })

  it('does NOT call the user-scoped cascade revocation when the row is entirely absent — nothing to cascade', async () => {
    // Contrast with lib/server/auth/auth.refresh-reuse.security.test.ts,
    // where the row DOES exist with revokedAt already set — that's the case
    // the cascade actually fires for.
    const prisma = createMockPrisma()
    prisma.refreshToken.findUnique.mockResolvedValue(null)

    await expect(
      refreshTokens(prisma, 'stolen-old-token')
    ).rejects.toMatchObject({ statusCode: 401 })

    expectNoCascade(prisma)
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled()
    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled()
  })

  it("a successful rotation only claims (revokes) the exact rotated token, never touches the user's other sessions", async () => {
    // A user with two active sessions (two refresh-token rows). Rotating
    // one must not disturb the other.
    const prisma = createMockPrisma()
    const user = makeUser()
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 'session-A-token',
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: null,
      user,
    })
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 })
    prisma.refreshToken.create.mockResolvedValue({})

    await refreshTokens(prisma, 'session-A-token')

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { token: 'session-A-token', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
    // Session B's token was never referenced, queried, or touched, and
    // rotation never deletes the row outright anymore.
    expect(prisma.refreshToken.delete).not.toHaveBeenCalled()
    expectNoCascade(prisma)
  })

  it('a genuine race (two callers both observe revokedAt: null) 401s the loser instead of 500ing, without cascading', async () => {
    // Regression test for the real bug found via live concurrent-request
    // testing, re-expressed for the new updateMany-based claim mechanism:
    // two overlapping refreshes with the same token both pass the
    // revokedAt-check above before either's atomic claim commits. Only one
    // `updateMany({where: {token, revokedAt: null}, ...})` can match a row
    // (Postgres serializes concurrent updates) — the loser sees `count: 0`
    // and must cleanly 401, not cascade (this is an honest double-fire, not
    // evidence of theft) and never 500.
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
      message: 'Invalid or expired refresh token',
    })
    expectNoCascade(prisma)
  })

  it('re-throws an unrelated error from the atomic claim as-is (not silently swallowed as 401)', async () => {
    const prisma = createMockPrisma()
    const user = makeUser()
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: 'some-token',
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: null,
      user,
    })
    const dbDown = Object.assign(new Error('Connection terminated'), {
      code: 'P1001',
    })
    prisma.refreshToken.updateMany.mockRejectedValue(dbDown)

    await expect(refreshTokens(prisma, 'some-token')).rejects.toBe(dbDown)
  })
})
