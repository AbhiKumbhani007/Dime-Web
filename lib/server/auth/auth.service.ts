import 'server-only'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import type { PrismaClient, User } from '@prisma/client'
import { httpError } from '@/lib/server/httpError'
import { seedDefaultCategories } from '@/lib/server/defaultCategories'

const BCRYPT_ROUNDS = 10
const REFRESH_TOKEN_EXPIRY_DAYS = 30
const ACCESS_TOKEN_TTL = '15m'
// How long a rotated-out (revokedAt set) RefreshToken row sticks around after
// being revoked, purely so a replay of it can still be detected and trigger
// the reuse cascade below. A replay presented more than a day after its own
// rotation has already had every reasonable window to be caught — mirrors
// lib/server/rateLimit.ts's RateLimitBucket cleanup-age reasoning (see its
// CLEANUP_AGE_MS) and is documented the same way in tdd.md's Risks section.
const REVOKED_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface UserProfile {
  id: string
  email: string
  name: string | null
  theme: string
  createdAt: string
}

export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    theme: user.theme,
    createdAt: user.createdAt.toISOString(),
  }
}

function secretKey() {
  return new TextEncoder().encode(process.env.JWT_ACCESS_SECRET)
}

async function signAccessToken(
  user: Pick<User, 'id' | 'email'>
): Promise<string> {
  return new SignJWT({ userId: user.id, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secretKey())
}

export async function issueTokens(
  prisma: PrismaClient,
  user: User
): Promise<TokenPair> {
  const refreshToken = crypto.randomUUID()

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS)

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt,
    },
  })

  const accessToken = await signAccessToken(user)

  return { accessToken, refreshToken }
}

export async function registerUser(
  prisma: PrismaClient,
  email: string,
  password: string,
  name?: string
): Promise<{ tokens: TokenPair; user: UserProfile }> {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw httpError(409, 'Email already registered')
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  let user: User
  try {
    user = await prisma.user.create({
      data: { email, passwordHash, name },
    })
  } catch (err: unknown) {
    // Two concurrent registrations for the same email can both pass the
    // findUnique check above before either commits (TOCTOU race) — the
    // `email @unique` constraint still stops a duplicate row, but without
    // this catch the loser's P2002 propagates as an uncaught error and
    // surfaces as a 500 instead of the documented 409 (found via adversarial
    // concurrent-request test).
    const e = err as { code?: string }
    if (e.code === 'P2002') {
      throw httpError(409, 'Email already registered')
    }
    throw err
  }

  await seedDefaultCategories(prisma, user.id)

  const tokens = await issueTokens(prisma, user)

  return { tokens, user: toUserProfile(user) }
}

export async function loginUser(
  prisma: PrismaClient,
  email: string,
  password: string
): Promise<{ tokens: TokenPair; user: UserProfile }> {
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || !user.passwordHash) {
    throw httpError(401, 'Invalid email or password')
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    throw httpError(401, 'Invalid email or password')
  }

  const tokens = await issueTokens(prisma, user)

  return { tokens, user: toUserProfile(user) }
}

export async function refreshTokens(
  prisma: PrismaClient,
  token: string
): Promise<TokenPair> {
  // Opportunistic cleanup, same "delete stale rows on every check" pattern as
  // lib/server/rateLimit.ts's checkRateLimit — no separate cron. Revoked rows
  // only need to live long enough to catch a delayed replay (see
  // REVOKED_TOKEN_RETENTION_MS above); anything older than that is safe to
  // drop.
  await prisma.refreshToken.deleteMany({
    where: { revokedAt: { lt: new Date(Date.now() - REVOKED_TOKEN_RETENTION_MS) } },
  })

  const existing = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!existing) {
    throw httpError(401, 'Invalid or expired refresh token')
  }

  if (existing.revokedAt) {
    // This exact token was already rotated out by a *previous* request
    // before this one even read it. A well-behaved single client never
    // presents a non-current refresh token, so treat this as a possible
    // theft signal: revoke the entire session family (every RefreshToken
    // row for this user), not just this one token. This is intentionally
    // different from the concurrent-race case below, where two requests
    // both observe revokedAt: null and only one wins the atomic claim —
    // that's an honest double-fire, not evidence of theft, so it must not
    // cascade.
    await prisma.refreshToken.deleteMany({
      where: { userId: existing.userId },
    })
    throw httpError(401, 'Invalid or expired refresh token')
  }

  if (existing.expiresAt < new Date()) {
    throw httpError(401, 'Invalid or expired refresh token')
  }

  // Atomically claim this token for rotation. Two concurrent requests can
  // both pass the checks above seeing revokedAt: null before either commits
  // — only one of them can win this conditional update (Postgres serializes
  // concurrent UPDATEs to the same row), so `claimed.count` distinguishes
  // the winner from the loser without a separate lock.
  const claimed = await prisma.refreshToken.updateMany({
    where: { token, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  if (claimed.count === 0) {
    // Lost the race to a concurrent request that rotated this exact token a
    // moment ago. NOT the same as the revokedAt-already-set case above —
    // both requests read revokedAt: null, so this is an honest simultaneous
    // double-fire, not evidence of theft. Do not cascade-revoke; that would
    // also kill the race's winner's brand-new session.
    throw httpError(401, 'Invalid or expired refresh token')
  }

  // This request won — proceed exactly as before: issue a new access+refresh
  // token pair. The old row is kept (now revoked, not deleted) so a later
  // replay of it can still be detected by the check above.
  return issueTokens(prisma, existing.user)
}

export async function logoutUser(
  prisma: PrismaClient,
  token: string
): Promise<void> {
  // Logout is an intentional, single-token action, not a rotation — a plain
  // delete (rather than the revokedAt-and-keep approach refreshTokens now
  // uses) is fine here, since there's no later "was this replayed" check
  // that needs the row to still exist.
  await prisma.refreshToken.delete({ where: { token } }).catch(() => {
    // Silently ignore if token not found
  })
}

export async function getMe(
  prisma: PrismaClient,
  userId: string
): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null
  return toUserProfile(user)
}

export async function updateMe(
  prisma: PrismaClient,
  userId: string,
  data: { name?: string; theme?: string }
): Promise<UserProfile> {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  })
  return toUserProfile(user)
}

export async function updatePassword(
  prisma: PrismaClient,
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })

  if (!user || !user.passwordHash) {
    throw httpError(404, 'User not found')
  }

  const valid = await bcrypt.compare(oldPassword, user.passwordHash)
  if (!valid) {
    throw httpError(400, 'Current password is incorrect')
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  })
}

export async function deleteMe(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  await prisma.user.delete({ where: { id: userId } })
}

export async function googleAuth(
  prisma: PrismaClient,
  idToken: string
): Promise<{ tokens: TokenPair; user: UserProfile }> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  )

  if (!res.ok) {
    throw httpError(401, 'Invalid Google ID token')
  }

  const payload = (await res.json()) as {
    email?: string
    name?: string
    error_description?: string
  }

  if (!payload.email) {
    throw httpError(401, 'Google token missing email claim')
  }

  let user = await prisma.user.findUnique({
    where: { email: payload.email },
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: payload.email,
        name: payload.name ?? null,
        passwordHash: null,
      },
    })

    await seedDefaultCategories(prisma, user.id)
  }

  const tokens = await issueTokens(prisma, user)

  return { tokens, user: toUserProfile(user) }
}
