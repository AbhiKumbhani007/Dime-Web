// @vitest-environment node
// authenticate() imports jose, which needs Node's real Uint8Array/CryptoKey
// realm — jsdom's globals are a different realm and fail jose's instanceof checks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { GET } from './export/route'
import { POST as PREVIEW } from './import/preview/route'
import { POST as COMMIT } from './import/commit/route'
import { prisma } from '@/lib/server/prisma'
import { hashFileBytes, signPreviewToken } from '@/lib/server/csv/csv.token'

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    category: { findMany: vi.fn() },
    consumedPreviewToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
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
const USER_ID = 'user_1'
const CATEGORY_ID = 'clcat000000000000000000001'

async function signToken(
  payload: Record<string, unknown> = {
    userId: USER_ID,
    email: 'a@example.com',
  },
  secret = TEST_SECRET
) {
  const key = new TextEncoder().encode(secret)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key)
}

function makeRequest(
  method: string,
  url: string,
  { token }: { token?: string } = {}
) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new Request(url, { method, headers })
}

function makeFormDataRequest(
  method: string,
  url: string,
  { token, formData }: { token?: string; formData: FormData }
) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new Request(url, { method, headers, body: formData })
}

const VALID_CSV =
  'Date,Amount,Type,Category,Note\r\n2026-08-30,1250.00,Expense,Groceries,Weekly shop\r\n'

function csvFile(content: string, name = 'import.csv'): File {
  return new File([content], name, { type: 'text/csv' })
}

function makeTransactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cltx0000000000000000000001',
    amount: 1250,
    date: new Date('2026-08-30T00:00:00.000Z'),
    note: 'Weekly shop',
    isIncome: false,
    userId: USER_ID,
    categoryId: CATEGORY_ID,
    category: { id: CATEGORY_ID, name: 'Groceries' },
    ...overrides,
  }
}

describe('csv routes', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.clearAllMocks()
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 1,
    } as never)
    // commitImport's single-use enforcement — default to "claims cleanly" /
    // "nothing stale to clean up" so tests that don't specifically exercise
    // token-reuse rejection don't need to mock these individually.
    vi.mocked(prisma.consumedPreviewToken.create).mockResolvedValue(
      {} as never
    )
    vi.mocked(prisma.consumedPreviewToken.deleteMany).mockResolvedValue({
      count: 0,
    } as never)
    vi.mocked(prisma.$transaction).mockImplementation(((
      cb: (tx: unknown) => unknown
    ) => cb(prisma)) as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('GET /api/csv/export', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await GET(
        makeRequest('GET', 'http://localhost/api/csv/export')
      )
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing token',
      })
    })

    it('429s at the tighter 10/min export override, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 11,
      } as never)
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/csv/export', { token })
      )
      expect(response.status).toBe(429)
      const body = await response.json()
      expect(body.error.code).toBe('RATE_LIMITED')
      expect(prisma.transaction.findMany).not.toHaveBeenCalled()
    })

    it('400s for an invalid from date', async () => {
      const token = await signToken()
      const response = await GET(
        makeRequest('GET', 'http://localhost/api/csv/export?from=not-a-date', {
          token,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('200s with the exact headers and a BOM-prefixed body, even with no transactions', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/csv/export', { token })
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(
        'text/csv; charset=utf-8'
      )
      expect(response.headers.get('content-disposition')).toMatch(
        /^attachment; filename="paisa-export-\d{4}-\d{2}-\d{2}\.csv"$/
      )
      expect(response.headers.get('cache-control')).toBe('no-store')
      // Read the raw wire bytes rather than .text() — Response.text()'s
      // TextDecoder strips a leading BOM as an encoding signature by
      // default, which would hide a real regression here. The actual
      // bytes sent over the wire (what curl/Excel see) do carry it.
      const bytes = new Uint8Array(await response.arrayBuffer())
      expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
      expect(new TextDecoder().decode(bytes)).toContain(
        'Date,Amount,Type,Category,Note'
      )
    })

    it('streams a CSV line per transaction and quotes a comma-containing note', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findMany)
        .mockResolvedValueOnce([
          makeTransactionRow({ note: 'Fruit, veg, and a "treat"' }),
        ] as never)
        .mockResolvedValueOnce([] as never)

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/csv/export', { token })
      )
      const text = await response.text()
      expect(text).toContain('"Fruit, veg, and a ""treat"""')
    })

    it('applies from/to as a date filter', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)

      await GET(
        makeRequest(
          'GET',
          'http://localhost/api/csv/export?from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z',
          { token }
        )
      )

      const args = vi.mocked(prisma.transaction.findMany).mock.calls[0]?.[0]
      expect(args?.where).toMatchObject({
        userId: USER_ID,
        date: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-12-31T00:00:00.000Z'),
        },
      })
    })

    it('500s with the standardized envelope when findMany rejects', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findMany).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/csv/export', { token })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('POST /api/csv/import/preview', () => {
    it('401s when the Authorization header is missing', async () => {
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      const response = await PREVIEW(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/preview', {
          formData,
        })
      )
      expect(response.status).toBe(401)
    })

    it('429s when the global rate limit is exceeded, without reading the upload', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))

      const response = await PREVIEW(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(429)
      expect(prisma.category.findMany).not.toHaveBeenCalled()
    })

    it('400s "No file uploaded" when the file field is absent', async () => {
      const token = await signToken()
      const formData = new FormData()
      formData.set('note', 'no file here')

      const response = await PREVIEW(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'No file uploaded',
      })
    })

    it('400s "File must be a .csv file" for a non-csv extension', async () => {
      const token = await signToken()
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV, 'data.txt'))

      const response = await PREVIEW(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('File must be a .csv file')
    })

    it('400s "File exceeds the 2MB limit" and never checks categories, for an oversized upload', async () => {
      const token = await signToken()
      const oversized = 'a'.repeat(2 * 1024 * 1024 + 1024)
      const formData = new FormData()
      formData.set('file', csvFile(oversized, 'huge.csv'))

      const response = await PREVIEW(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('File exceeds the 2MB limit')
      expect(prisma.category.findMany).not.toHaveBeenCalled()
    })

    it('400s when a required header column is missing', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: CATEGORY_ID, name: 'Groceries' },
      ] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      const csv =
        'Date,Amount,Category,Note\r\n2026-08-30,1250.00,Groceries,Weekly shop\r\n'
      const formData = new FormData()
      formData.set('file', csvFile(csv))

      const response = await PREVIEW(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toMatch(/Type/)
    })

    it('200s with previewToken/expiresAt and counts summing to totalRows', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: CATEGORY_ID, name: 'Groceries' },
      ] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))

      const response = await PREVIEW(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.totalRows).toBe(1)
      expect(body.readyCount).toBe(1)
      expect(body.readyCount + body.duplicateCount + body.errorCount).toBe(
        body.totalRows
      )
      expect(body).toHaveProperty('previewToken')
      expect(body).toHaveProperty('expiresAt')
    })

    it('an unknown category classifies as an UNKNOWN_CATEGORY error row, never auto-created', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))

      const response = await PREVIEW(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.errorCount).toBe(1)
      expect(body.errors[0].code).toBe('UNKNOWN_CATEGORY')
    })

    it('500s with the standardized envelope on an unexpected service error', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findMany).mockRejectedValue(
        new Error('connection lost')
      )
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))

      const response = await PREVIEW(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('POST /api/csv/import/commit', () => {
    async function getPreviewToken(csv: string): Promise<string> {
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: CATEGORY_ID, name: 'Groceries' },
      ] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      const token = await signToken()
      const formData = new FormData()
      formData.set('file', csvFile(csv))
      const response = await PREVIEW(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/preview', {
          token,
          formData,
        })
      )
      const body = await response.json()
      return body.previewToken
    }

    it('401s when the Authorization header is missing', async () => {
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', 'irrelevant')

      const response = await COMMIT(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/commit', {
          formData,
        })
      )
      expect(response.status).toBe(401)
      expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    })

    it('429s when the global rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', 'irrelevant')

      const response = await COMMIT(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(429)
      expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    })

    it('400s "No file uploaded" when the file field is absent', async () => {
      const token = await signToken()
      const formData = new FormData()
      formData.set('previewToken', 'irrelevant')

      const response = await COMMIT(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('No file uploaded')
    })

    it('400s "previewToken is required" when the field is missing', async () => {
      const token = await signToken()
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))

      const response = await COMMIT(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('previewToken is required')
    })

    it('400s on a malformed token, never calling createMany', async () => {
      const token = await signToken()
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', 'not-a-real-token')

      const response = await COMMIT(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    })

    it('201s and imports the ready rows for a matching file + token', async () => {
      const previewToken = await getPreviewToken(VALID_CSV)
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: CATEGORY_ID, name: 'Groceries' },
      ] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.transaction.createMany).mockResolvedValue({
        count: 1,
      } as never)
      const token = await signToken()
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', previewToken)

      const response = await COMMIT(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.imported).toBe(1)
      expect(body.driftedFromPreview).toBe(false)
      expect(prisma.transaction.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              amount: 1250,
              categoryId: CATEGORY_ID,
              userId: USER_ID,
            }),
          ],
        })
      )
    })

    it('409s and never calls createMany when the uploaded file differs from the one previewed', async () => {
      const previewToken = await getPreviewToken(VALID_CSV)
      const token = await signToken()
      const differentCsv =
        'Date,Amount,Type,Category,Note\r\n2026-01-01,10.00,Expense,Groceries,\r\n'
      const formData = new FormData()
      formData.set('file', csvFile(differentCsv))
      formData.set('previewToken', previewToken)

      const response = await COMMIT(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'CONFLICT',
        message: 'The selected file does not match the previewed file',
      })
      expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    })

    it('201s with driftedFromPreview: true when data changed between preview and commit', async () => {
      const previewToken = await getPreviewToken(VALID_CSV)
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: CATEGORY_ID, name: 'Groceries' },
      ] as never)
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([
        {
          date: new Date('2026-08-30T00:00:00.000Z'),
          amount: 1250,
          note: 'Weekly shop',
        },
      ] as never)
      const token = await signToken()
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', previewToken)

      const response = await COMMIT(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.driftedFromPreview).toBe(true)
      expect(body.imported).toBe(0)
      expect(body.skippedDuplicates).toBe(1)
      expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    })

    it('400s on a token issued to a different user, never calling createMany', async () => {
      const otherUsersToken = signPreviewToken({
        userId: 'someone-else',
        fileHash: hashFileBytes(Buffer.from(VALID_CSV, 'utf8')),
        readyCount: 1,
        duplicateCount: 0,
        errorCount: 0,
      })
      const token = await signToken()
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', otherUsersToken)

      const response = await COMMIT(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(400)
      expect(prisma.transaction.createMany).not.toHaveBeenCalled()
    })

    it('500s with the standardized envelope on an unexpected service error', async () => {
      const previewToken = await getPreviewToken(VALID_CSV)
      vi.mocked(prisma.category.findMany).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()
      const formData = new FormData()
      formData.set('file', csvFile(VALID_CSV))
      formData.set('previewToken', previewToken)

      const response = await COMMIT(
        makeFormDataRequest('POST', 'http://localhost/api/csv/import/commit', {
          token,
          formData,
        })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
