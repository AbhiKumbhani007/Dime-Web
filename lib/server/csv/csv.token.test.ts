// @vitest-environment node
// node:crypto's HMAC/timingSafeEqual work fine under jsdom too, but this
// module lives in lib/server/** and targets the Node runtime per convention
// (see lib/server/auth/authenticate.test.ts) — kept explicit for consistency.
import { describe, it, expect } from 'vitest'

// csv.token.ts reads process.env.JWT_ACCESS_SECRET directly (see its own
// comment) rather than a shared config module, so tests must set it
// themselves rather than relying on a real .env file.
process.env.JWT_ACCESS_SECRET =
  'test-jwt-access-secret-at-least-32-characters!!'

import {
  hashFileBytes,
  signPreviewToken,
  verifyPreviewToken,
} from './csv.token'

const PAYLOAD = {
  userId: 'user1',
  fileHash: hashFileBytes(Buffer.from('Date,Amount,Type,Category,Note\n')),
  readyCount: 10,
  duplicateCount: 2,
  errorCount: 1,
}

describe('hashFileBytes', () => {
  it('is deterministic for identical bytes', () => {
    const a = hashFileBytes(Buffer.from('hello'))
    const b = hashFileBytes(Buffer.from('hello'))
    expect(a).toBe(b)
  })

  it('differs for different bytes', () => {
    const a = hashFileBytes(Buffer.from('hello'))
    const b = hashFileBytes(Buffer.from('hellp'))
    expect(a).not.toBe(b)
  })
})

describe('signPreviewToken / verifyPreviewToken', () => {
  it('round-trips: a freshly signed token verifies with the same payload', () => {
    const token = signPreviewToken(PAYLOAD)
    const result = verifyPreviewToken(token)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.userId).toBe(PAYLOAD.userId)
      expect(result.payload.fileHash).toBe(PAYLOAD.fileHash)
      expect(result.payload.readyCount).toBe(PAYLOAD.readyCount)
      expect(result.payload.duplicateCount).toBe(PAYLOAD.duplicateCount)
      expect(result.payload.errorCount).toBe(PAYLOAD.errorCount)
    }
  })

  it('a tampered payload segment fails signature verification', () => {
    const token = signPreviewToken(PAYLOAD)
    const [payloadB64, signature] = token.split('.')
    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    )
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...decoded, readyCount: decoded.readyCount + 1000 })
    ).toString('base64url')

    const result = verifyPreviewToken(`${tamperedPayload}.${signature}`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('BAD_SIGNATURE')
  })

  it('a tampered signature fails verification', () => {
    const token = signPreviewToken(PAYLOAD)
    const [payloadB64] = token.split('.')
    const result = verifyPreviewToken(`${payloadB64}.not-the-real-signature`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('BAD_SIGNATURE')
  })

  it('a malformed token (no separator) is rejected', () => {
    const result = verifyPreviewToken('not-a-valid-token')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('MALFORMED')
  })

  it('an expired token is rejected', () => {
    const token = signPreviewToken({ ...PAYLOAD, exp: Date.now() - 1000 })
    const result = verifyPreviewToken(token)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('EXPIRED')
  })

  it('a token still within its TTL is accepted', () => {
    const token = signPreviewToken({ ...PAYLOAD, exp: Date.now() + 1000 })
    const result = verifyPreviewToken(token)
    expect(result.ok).toBe(true)
  })
})
