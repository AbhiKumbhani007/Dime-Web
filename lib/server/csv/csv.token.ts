import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// Exported so csv.service.ts's ConsumedPreviewToken cleanup (see commitImport)
// can size its own retention window relative to this TTL, rather than
// hardcoding a second copy of the same number.
export const PREVIEW_TOKEN_TTL_MS = 30 * 60 * 1000

// Reads process.env directly rather than a shared config module — this repo
// has no such module (see lib/server/auth/authenticate.ts's identical
// direct read of JWT_ACCESS_SECRET), so there's no validate-everything-at-
// startup wrapper to route around either way. Kept as a lazy read so this
// file stays importable (and its pure functions testable) even before any
// env var is set.
function getSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set')
  return secret
}

export interface PreviewTokenPayload {
  userId: string
  fileHash: string
  exp: number
  readyCount: number
  duplicateCount: number
  errorCount: number
}

export type VerifyResult =
  | { ok: true; payload: PreviewTokenPayload }
  | { ok: false; reason: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' }

export function hashFileBytes(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

// Hashes the FULL token string — signature included — so a tampered token
// (different payload or signature) can never collide with a real, previously
// issued token's hash. Used by commitImport's single-use enforcement to key
// the ConsumedPreviewToken row without storing the raw token itself.
export function hashPreviewToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function sign(payloadB64: string): string {
  return createHmac('sha256', getSecret())
    .update(payloadB64)
    .digest('base64url')
}

// A hand-rolled HMAC rather than the `jose`/bearer-token machinery — deliberate,
// so this token can never be mistaken for (or accidentally accepted as) a real
// access token. The preview-time counts travel inside the payload itself,
// since the import flow is intentionally stateless: this is what commit
// diffs against to compute `driftedFromPreview`.
export function signPreviewToken(
  payload: Omit<PreviewTokenPayload, 'exp'> & { exp?: number }
): string {
  const full: PreviewTokenPayload = {
    ...payload,
    exp: payload.exp ?? Date.now() + PREVIEW_TOKEN_TTL_MS,
  }
  const payloadB64 = Buffer.from(JSON.stringify(full)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64)}`
}

export function verifyPreviewToken(token: string): VerifyResult {
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'MALFORMED' }
  const [payloadB64, signature] = parts

  const expectedSignature = sign(payloadB64)
  const provided = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return { ok: false, reason: 'BAD_SIGNATURE' }
  }

  let payload: PreviewTokenPayload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'MALFORMED' }
  }

  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
    return { ok: false, reason: 'EXPIRED' }
  }

  return { ok: true, payload }
}
