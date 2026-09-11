// @vitest-environment node
// authenticate() imports jose, which needs Node's real Uint8Array/CryptoKey
// realm — jsdom's globals are a different realm and fail jose's instanceof checks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { POST as PREVIEW } from './import/preview/route'
import { POST as COMMIT } from './import/commit/route'
import { prisma } from '@/lib/server/prisma'
import { signPreviewToken, hashFileBytes } from '@/lib/server/csv/csv.token'

// Adversarial coverage for the CSV routes beyond csv.routes.test.ts: exact
// file-size boundaries, extension/content mismatches, and — the CSV-specific
// half of preview-token abuse this domain owns — using a real previewToken
// minted for one authenticated user to attempt commit as a different real
// authenticated user (full HTTP round trip through both routes, not a
// directly-constructed token), a tampered token (one flipped byte on a real
// token), an expired token at the route boundary, and a byte-identical-content-
// but-different-line-ending file against the documented 409.

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    category: { findMany: vi.fn() },
    $transaction: vi
      .fn()
      .mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma)),
    rateLimitBucket: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

const TEST_SECRET = 'test-jwt-access-secret-at-least-32-characters-long'
const USER_A = 'user_a'
const USER_B = 'user_b'
const CATEGORY_ID = 'clcat000000000000000000001'

async function signToken(userId: string, secret = TEST_SECRET) {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ userId, email: `${userId}@example.com` })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key)
}

function makeFormDataRequest(
  url: string,
  { token, formData }: { token?: string; formData: FormData }
) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new Request(url, { method: 'POST', headers, body: formData })
}

function csvFile(content: string, name = 'import.csv'): File {
  return new File([content], name, { type: 'text/csv' })
}

const VALID_CSV =
  'Date,Amount,Type,Category,Note\r\n2026-08-30,1250.00,Expense,Groceries,Weekly shop\r\n'

const MAX_FILE_BYTES = 2 * 1024 * 1024

describe('csv routes — adversarial', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.clearAllMocks()
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 1,
    } as never)
    vi.mocked(prisma.$transaction).mockImplementation(((
      cb: (tx: unknown) => unknown
    ) => cb(prisma)) as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('POST /api/csv/import/preview — file-size boundary', () => {
    it('accepts a file exactly at the 2MB cap', async () => {
      const token = await signToken(USER_A)
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: CATEGORY_ID, name: 'Groceries' },
      ] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)

      const padding = 'x'.repeat(
        MAX_FILE_BYTES - Buffer.byteLength(VALID_CSV, 'utf8')
      )
      // Padding lives in a Note value long enough to fail NOTE_TOO_LONG —
      // the point here is purely the byte-size gate, not row validity.
      const content = VALID_CSV.slice(0, -2) + padding + '\r\n'
      const formData = new FormData()
      formData.set('file', csvFile(content, 'exactly-2mb.csv'))

      const response = await PREVIEW(
        makeFormDataRequest('http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      // Must clear the size gate (never a 400 "exceeds the 2MB limit") and
      // actually reach classification (200), not merely avoid that one
      // specific error string.
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.error?.message).not.toBe('File exceeds the 2MB limit')
    })

    it('rejects a file exactly one byte over the 2MB cap', async () => {
      const token = await signToken(USER_A)
      const oversized = 'a'.repeat(MAX_FILE_BYTES + 1)
      const formData = new FormData()
      formData.set('file', csvFile(oversized, 'over-by-one.csv'))

      const response = await PREVIEW(
        makeFormDataRequest('http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('File exceeds the 2MB limit')
      expect(prisma.category.findMany).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/csv/import/preview — extension/content mismatches', () => {
    it('rejects a file with no extension at all', async () => {
      const token = await signToken(USER_A)
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV, 'data'))

      const response = await PREVIEW(
        makeFormDataRequest('http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('File must be a .csv file')
    })

    it('rejects a double-extension disguise (data.csv.exe)', async () => {
      const token = await signToken(USER_A)
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV, 'data.csv.exe'))

      const response = await PREVIEW(
        makeFormDataRequest('http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('File must be a .csv file')
    })

    it('accepts an uppercase .CSV extension (case-insensitive check)', async () => {
      const token = await signToken(USER_A)
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: CATEGORY_ID, name: 'Groceries' },
      ] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV, 'DATA.CSV'))

      const response = await PREVIEW(
        makeFormDataRequest('http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(200)
    })

    it('a .csv file containing unparseable binary garbage → 400 "Could not parse CSV file"', async () => {
      const token = await signToken(USER_A)
      // Deliberately malformed CSV: an opening quote in a field that's
      // never closed — csv-parse throws rather than guessing.
      const garbage =
        'Date,Amount,Type,Category,Note\r\n"2026-08-30,10.00,Expense,Groceries,unterminated\r\n'
      const formData = new FormData()
      formData.set('file', csvFile(garbage, 'looks-valid.csv'))

      const response = await PREVIEW(
        makeFormDataRequest('http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('Could not parse CSV file')
    })
  })

  describe('POST /api/csv/import/commit — preview-token abuse', () => {
    async function previewAs(userId: string, csv: string): Promise<string> {
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: CATEGORY_ID, name: 'Groceries' },
      ] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      const token = await signToken(userId)
      const formData = new FormData()
      formData.set('file', csvFile(csv))
      const response = await PREVIEW(
        makeFormDataRequest('http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      const body = await response.json()
      return body.previewToken
    }

    it('a previewToken minted for user A is rejected when user B tries to commit with it (full round trip, not a hand-signed token)', async () => {
      const previewTokenForA = await previewAs(USER_A, VALID_CSV)

      const tokenForB = await signToken(USER_B)
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', previewTokenForA)

      const response = await COMMIT(
        makeFormDataRequest('http://localhost/api/csv/import/commit', {
          token: tokenForB,
          formData,
        })
      )
      expect(response.status).toBe(400)
      expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    })

    it('the rightful user (A) can still commit their own previewToken (control case for the above)', async () => {
      const previewTokenForA = await previewAs(USER_A, VALID_CSV)

      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: CATEGORY_ID, name: 'Groceries' },
      ] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.transaction.createMany).mockResolvedValue({
        count: 1,
      } as never)
      const tokenForA = await signToken(USER_A)
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', previewTokenForA)

      const response = await COMMIT(
        makeFormDataRequest('http://localhost/api/csv/import/commit', {
          token: tokenForA,
          formData,
        })
      )
      expect(response.status).toBe(201)
    })

    it('a tampered previewToken (one flipped byte in a real, freshly-minted token) is rejected', async () => {
      const previewToken = await previewAs(USER_A, VALID_CSV)
      const [payloadB64, signature] = previewToken.split('.')
      // Substitute the first character of the signature for a guaranteed-
      // different one from the base64url alphabet (flipping case is not
      // reliable here — it's a no-op for digits/`-`/`_`, which would leave
      // the token un-tampered and the test vacuously "passing").
      const alphabet =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
      const replacement =
        alphabet[(alphabet.indexOf(signature[0]) + 1) % alphabet.length]
      const tampered = `${payloadB64}.${replacement}${signature.slice(1)}`

      const token = await signToken(USER_A)
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', tampered)

      const response = await COMMIT(
        makeFormDataRequest('http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    })

    it('an expired previewToken (past the 30-minute TTL) is rejected at the route boundary', async () => {
      const expiredToken = signPreviewToken({
        userId: USER_A,
        fileHash: hashFileBytes(Buffer.from(VALID_CSV, 'utf8')),
        readyCount: 1,
        duplicateCount: 0,
        errorCount: 0,
        exp: Date.now() - 60_000,
      })

      const token = await signToken(USER_A)
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', expiredToken)

      const response = await COMMIT(
        makeFormDataRequest('http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toMatch(/upload the file again/)
      expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    })

    it('re-preview then re-commit after an expired token is rejected → a fresh preview works cleanly', async () => {
      // Confirms the expired-token rejection isn't a dead end — the
      // documented recovery path (re-upload) actually succeeds.
      const expiredToken = signPreviewToken({
        userId: USER_A,
        fileHash: hashFileBytes(Buffer.from(VALID_CSV, 'utf8')),
        readyCount: 1,
        duplicateCount: 0,
        errorCount: 0,
        exp: Date.now() - 60_000,
      })
      const token = await signToken(USER_A)
      const staleFormData = new FormData()
      staleFormData.set('file', csvFile(VALID_CSV))
      staleFormData.set('previewToken', expiredToken)
      const staleResponse = await COMMIT(
        makeFormDataRequest('http://localhost/api/csv/import/commit', {
          token,
          formData: staleFormData,
        })
      )
      expect(staleResponse.status).toBe(400)

      const freshPreviewToken = await previewAs(USER_A, VALID_CSV)
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: CATEGORY_ID, name: 'Groceries' },
      ] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.transaction.createMany).mockResolvedValue({
        count: 1,
      } as never)
      const commitFormData = new FormData()
      commitFormData.set('file', csvFile(VALID_CSV))
      commitFormData.set('previewToken', freshPreviewToken)
      const commitResponse = await COMMIT(
        makeFormDataRequest('http://localhost/api/csv/import/commit', {
          token,
          formData: commitFormData,
        })
      )
      expect(commitResponse.status).toBe(201)
    })

    it('byte-identical content but different line endings (LF vs the previewed CRLF) 409s as a hash mismatch', async () => {
      const previewToken = await previewAs(USER_A, VALID_CSV)
      const lfVariant = VALID_CSV.replace(/\r\n/g, '\n')

      const token = await signToken(USER_A)
      const formData = new FormData()
      formData.set('file', csvFile(lfVariant))
      formData.set('previewToken', previewToken)

      const response = await COMMIT(
        makeFormDataRequest('http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(409)
      expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    })
  })
})
