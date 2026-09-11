import 'server-only'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import type { PrismaClient, User } from '@prisma/client'
import { httpError } from '@/lib/server/httpError'
import { seedDefaultCategories } from '@/lib/server/defaultCategories'

const BCRYPT_ROUNDS = 10
const REFRESH_TOKEN_EXPIRY_DAYS = 30
const ACCESS_TOKEN_TTL = '15m'

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
  const existing = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!existing || existing.expiresAt < new Date()) {
    throw httpError(401, 'Invalid or expired refresh token')
  }

  // Rotate: delete old token. Two concurrent refreshes with the same token
  // can both pass the findUnique check above before either commits (TOCTOU
  // race) — one delete wins, the other's row is already gone and Prisma
  // throws P2025 instead of silently no-oping. Without this catch that
  // propagates as an uncaught error and surfaces as a 500 instead of the
  // documented 401 (found via adversarial concurrent-request test).
  try {
    await prisma.refreshToken.delete({ where: { token } })
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2025') {
      throw httpError(401, 'Invalid or expired refresh token')
    }
    throw err
  }

  // Issue new pair
  return issueTokens(prisma, existing.user)
}

export async function logoutUser(
  prisma: PrismaClient,
  token: string
): Promise<void> {
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
