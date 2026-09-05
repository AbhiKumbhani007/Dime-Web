// @vitest-environment node
// jose's WebCrypto key handling needs Node's real Uint8Array/CryptoKey realm —
// jsdom's globals are a different realm and fail jose's `instanceof` checks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { authenticate, AuthError } from './authenticate'

const TEST_SECRET = 'test-jwt-access-secret-at-least-32-characters-long'

function signToken(
  payload: Record<string, unknown>,
  options: { secret?: string; expiresIn?: string } = {}
) {
  const key = new TextEncoder().encode(options.secret ?? TEST_SECRET)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '15m')
    .sign(key)
}

function requestWithAuth(header?: string) {
  return new Request('http://localhost/api/anything', {
    headers: header ? { authorization: header } : {},
  })
}

describe('authenticate', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns {userId, email} for a valid bearer token', async () => {
    const token = await signToken({ userId: 'user_1', email: 'a@example.com' })

    await expect(authenticate(requestWithAuth(`Bearer ${token}`))).resolves.toEqual({
      userId: 'user_1',
      email: 'a@example.com',
    })
  })

  it('throws AuthError when the Authorization header is missing', async () => {
    await expect(authenticate(requestWithAuth())).rejects.toThrow(AuthError)
  })

  it('throws AuthError when the header is not a Bearer token', async () => {
    const token = await signToken({ userId: 'user_1', email: 'a@example.com' })

    await expect(authenticate(requestWithAuth(token))).rejects.toThrow(AuthError)
  })

  it('throws AuthError for a token signed with the wrong secret', async () => {
    const token = await signToken(
      { userId: 'user_1', email: 'a@example.com' },
      { secret: 'a-completely-different-secret-of-32-chars' }
    )

    await expect(authenticate(requestWithAuth(`Bearer ${token}`))).rejects.toThrow(AuthError)
  })

  it('throws AuthError for an expired token', async () => {
    const token = await signToken(
      { userId: 'user_1', email: 'a@example.com' },
      { expiresIn: '-1s' }
    )

    await expect(authenticate(requestWithAuth(`Bearer ${token}`))).rejects.toThrow(AuthError)
  })

  it('throws AuthError when the payload is missing userId/email', async () => {
    const token = await signToken({ email: 'a@example.com' })

    await expect(authenticate(requestWithAuth(`Bearer ${token}`))).rejects.toThrow(AuthError)
  })
})
