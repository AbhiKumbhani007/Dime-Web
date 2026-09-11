// @vitest-environment node
// jose's WebCrypto key handling needs Node's real Uint8Array/CryptoKey realm —
// jsdom's globals are a different realm and fail jose's instanceof checks.
//
// Adversarial token-tampering coverage for `authenticate()` beyond what
// authenticate.test.ts already covers (missing header, non-Bearer, wrong
// secret, expired, missing claims). Every case here is a forged/mutated
// token an attacker could plausibly construct by hand — the bar is: does it
// get a clean AuthError (-> 401 at the route layer), never a crash and never
// an accidental accept.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { authenticate, AuthError } from './authenticate'

const TEST_SECRET = 'test-jwt-access-secret-at-least-32-characters-long'

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function flipSignatureByte(base64urlSig: string): string {
  // Flipping a *character* near the end of a base64url signature is
  // unreliable: HS256's 32-byte signature base64-encodes to 43 chars, and
  // the last character only carries 4 significant bits (the rest is
  // padding) — some character substitutions there decode to the exact same
  // bytes, silently producing a "tampered" string that isn't actually
  // tampered. Decode to real bytes and flip a bit well away from that
  // boundary instead, so this always changes the verified value.
  const bytes = Buffer.from(base64urlSig, 'base64url')
  bytes[0] = bytes[0] ^ 0xff
  return b64url(bytes)
}

function requestWithAuth(header?: string) {
  return new Request('http://localhost/api/anything', {
    headers: header ? { authorization: header } : {},
  })
}

async function signValidToken(
  payload: Record<string, unknown> = {
    userId: 'user_1',
    email: 'a@example.com',
  }
) {
  const key = new TextEncoder().encode(TEST_SECRET)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key)
}

describe('authenticate — adversarial token tampering', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects an unsigned {alg:"none"} token, even with a well-formed payload', async () => {
    const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    const payload = b64url(
      JSON.stringify({
        userId: 'user_1',
        email: 'a@example.com',
        exp: Math.floor(Date.now() / 1000) + 900,
      })
    )
    // alg:none tokens are conventionally sent with an empty signature segment.
    const token = `${header}.${payload}.`

    await expect(
      authenticate(requestWithAuth(`Bearer ${token}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects a token whose header claims {alg:"none"} but keeps a real signature appended', async () => {
    const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    const payload = b64url(
      JSON.stringify({
        userId: 'user_1',
        email: 'a@example.com',
        exp: Math.floor(Date.now() / 1000) + 900,
      })
    )
    const token = `${header}.${payload}.somesignaturevalue`

    await expect(
      authenticate(requestWithAuth(`Bearer ${token}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects a token signed with a disallowed-but-valid alg (HS384) using the correct secret', async () => {
    const key = new TextEncoder().encode(TEST_SECRET)
    const token = await new SignJWT({
      userId: 'user_1',
      email: 'a@example.com',
    })
      .setProtectedHeader({ alg: 'HS384' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(key)

    // authenticate() pins jwtVerify to algorithms: ['HS256'] — a token
    // correctly signed under a *different* HMAC algorithm, even with the
    // right secret, must still be rejected (algorithm-confusion guard).
    await expect(
      authenticate(requestWithAuth(`Bearer ${token}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects a validly-signed token whose signature has a single byte flipped', async () => {
    const token = await signValidToken()
    const [h, p, s] = token.split('.')
    const tampered = `${h}.${p}.${flipSignatureByte(s)}`

    await expect(
      authenticate(requestWithAuth(`Bearer ${tampered}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects a token whose payload was modified after signing (privilege escalation attempt)', async () => {
    const token = await signValidToken({
      userId: 'victim_user',
      email: 'victim@example.com',
    })
    const [h, , s] = token.split('.')
    // Attacker rewrites the payload to impersonate a different user, but
    // cannot produce a valid signature for it without the secret.
    const forgedPayload = b64url(
      JSON.stringify({
        userId: 'attacker_user',
        email: 'attacker@example.com',
        exp: Math.floor(Date.now() / 1000) + 900,
      })
    )
    const tampered = `${h}.${forgedPayload}.${s}`

    await expect(
      authenticate(requestWithAuth(`Bearer ${tampered}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects a truncated JWT (signature segment cut short)', async () => {
    const token = await signValidToken()
    const truncated = token.slice(0, token.length - 10)

    await expect(
      authenticate(requestWithAuth(`Bearer ${truncated}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects a JWT with a missing segment (only header.payload, no signature at all)', async () => {
    const token = await signValidToken()
    const [h, p] = token.split('.')
    const malformed = `${h}.${p}`

    await expect(
      authenticate(requestWithAuth(`Bearer ${malformed}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects a completely non-JWT garbage string without throwing a non-AuthError', async () => {
    await expect(
      authenticate(requestWithAuth('Bearer not.a.jwt.at.all.too-many-dots'))
    ).rejects.toThrow(AuthError)
  })

  it('rejects an empty-string bearer token', async () => {
    await expect(authenticate(requestWithAuth('Bearer '))).rejects.toThrow(
      AuthError
    )
  })

  it('rejects a header segment that is not valid base64url JSON', async () => {
    const [, p, s] = (await signValidToken()).split('.')
    const tampered = `not-valid-base64===.${p}.${s}`

    await expect(
      authenticate(requestWithAuth(`Bearer ${tampered}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects a payload segment that decodes to non-JSON garbage', async () => {
    const [h, , s] = await (async () => (await signValidToken()).split('.'))()
    const garbagePayload = b64url('this is not json at all {{{')
    const tampered = `${h}.${garbagePayload}.${s}`

    await expect(
      authenticate(requestWithAuth(`Bearer ${tampered}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects an oversized/garbage token without hanging or throwing a non-AuthError', async () => {
    const huge = 'A'.repeat(50_000)
    await expect(
      authenticate(requestWithAuth(`Bearer ${huge}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects a token with numeric userId/email claims (type confusion attempt)', async () => {
    const key = new TextEncoder().encode(TEST_SECRET)
    const token = await new SignJWT({ userId: 12345, email: 67890 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(key)

    await expect(
      authenticate(requestWithAuth(`Bearer ${token}`))
    ).rejects.toThrow(AuthError)
  })

  it('rejects a token with a fabricated far-future exp but wrong signature (cannot forge long-lived tokens)', async () => {
    const token = await signValidToken()
    const [h, , s] = token.split('.')
    const forgedPayload = b64url(
      JSON.stringify({
        userId: 'user_1',
        email: 'a@example.com',
        // Attacker tries to grant themselves a 100-year token.
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 100,
      })
    )
    const tampered = `${h}.${forgedPayload}.${s}`

    await expect(
      authenticate(requestWithAuth(`Bearer ${tampered}`))
    ).rejects.toThrow(AuthError)
  })
})
