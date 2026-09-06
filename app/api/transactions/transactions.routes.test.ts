// @vitest-environment node
// authenticate() imports jose, which needs Node's real Uint8Array/CryptoKey
// realm — jsdom's globals are a different realm and fail jose's instanceof checks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { GET, POST } from './route'
import { GET as GET_BY_ID, PATCH, DELETE } from './[id]/route'
import { prisma } from '@/lib/server/prisma'

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: { findFirst: vi.fn() },
    template: { updateMany: vi.fn() },
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

const VALID_CATEGORY_ID = 'clcat000000000000000000001'
const VALID_TEMPLATE_ID = 'cltemplate00000000000000001'
const VALID_TX_ID = 'cltx0000000000000000000001'

async function signToken(
  payload: Record<string, unknown> = {
    userId: 'user_1',
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
  { token, body }: { token?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_TX_ID,
    amount: 100,
    date: new Date('2024-06-15T10:00:00.000Z'),
    note: 'Lunch',
    isIncome: false,
    userId: 'user_1',
    categoryId: VALID_CATEGORY_ID,
    createdAt: new Date('2024-06-15T10:00:00.000Z'),
    updatedAt: new Date('2024-06-15T10:00:00.000Z'),
    ...overrides,
  }
}

const validCreateBody = {
  amount: 12.5,
  date: '2024-06-15T10:00:00.000Z',
  note: 'Lunch',
  isIncome: false,
  categoryId: VALID_CATEGORY_ID,
}

describe('transactions routes', () => {
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

  describe('GET /api/transactions', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await GET(
        makeRequest('GET', 'http://localhost/api/transactions')
      )
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing token',
      })
    })

    it('401s for a token signed with the wrong secret', async () => {
      const token = await signToken(
        undefined,
        'a-completely-different-secret-of-32'
      )
      const response = await GET(
        makeRequest('GET', 'http://localhost/api/transactions', { token })
      )
      expect(response.status).toBe(401)
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/transactions', { token })
      )
      expect(response.status).toBe(429)
      const body = await response.json()
      expect(body.error.code).toBe('RATE_LIMITED')
      expect(prisma.transaction.findMany).not.toHaveBeenCalled()
    })

    it('500s with the standardized envelope when the rate limiter itself throws', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/transactions', { token })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      })
    })

    it('500s with the standardized envelope when findMany rejects', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findMany).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/transactions', { token })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })

    it('200s and returns an unwrapped {items, nextCursor} for a normal page', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([
        makeTx({ id: 'a' }),
      ] as never)

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/transactions', { token })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.items).toHaveLength(1)
      expect(body.items[0].id).toBe('a')
      expect(body.nextCursor).toBeNull()
      expect(body.transaction).toBeUndefined()
    })

    it('cursor-pagination roundtrip: limit=2 truncates 3 rows and sets nextCursor', async () => {
      const token = await signToken()
      const rows = [
        makeTx({ id: 'a' }),
        makeTx({ id: 'b' }),
        makeTx({ id: 'c' }),
      ]
      vi.mocked(prisma.transaction.findMany).mockResolvedValue(rows as never)

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/transactions?limit=2', {
          token,
        })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.items.map((i: { id: string }) => i.id)).toEqual(['a', 'b'])
      expect(body.nextCursor).toBe('b')
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 })
      )
    })

    it('passes the cursor query param through as { cursor: { id }, skip: 1 }', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)

      await GET(
        makeRequest(
          'GET',
          `http://localhost/api/transactions?cursor=${VALID_TX_ID}`,
          { token }
        )
      )

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: VALID_TX_ID },
          skip: 1,
        })
      )
    })

    it('reflects combined search/categoryId/isIncome/from/to filters in where', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)

      const url =
        'http://localhost/api/transactions?' +
        `search=coffee&categoryId=${VALID_CATEGORY_ID}&isIncome=true` +
        '&from=2024-01-01T00:00:00.000Z&to=2024-12-31T23:59:59.000Z'

      await GET(makeRequest('GET', url, { token }))

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user_1',
            categoryId: VALID_CATEGORY_ID,
            isIncome: true,
            note: { contains: 'coffee', mode: 'insensitive' },
            date: {
              gte: new Date('2024-01-01T00:00:00.000Z'),
              lte: new Date('2024-12-31T23:59:59.000Z'),
            },
          },
        })
      )
    })

    it('400s for limit=500', async () => {
      const token = await signToken()
      const response = await GET(
        makeRequest('GET', 'http://localhost/api/transactions?limit=500', {
          token,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400s for limit=0', async () => {
      const token = await signToken()
      const response = await GET(
        makeRequest('GET', 'http://localhost/api/transactions?limit=0', {
          token,
        })
      )
      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/transactions', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(401)
      expect(prisma.transaction.create).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          token,
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(429)
      expect(prisma.transaction.create).not.toHaveBeenCalled()
    })

    it('201s and wraps the created transaction, checking category ownership', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id: VALID_CATEGORY_ID,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.transaction.create).mockResolvedValue(makeTx() as never)

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          token,
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.transaction.id).toBe(VALID_TX_ID)
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: VALID_CATEGORY_ID, userId: 'user_1' },
      })
    })

    it('404s when the category belongs to another user, never creates', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          token,
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Category not found',
      })
      expect(prisma.transaction.create).not.toHaveBeenCalled()
    })

    it.each([
      ['amount = 0', { amount: 0 }],
      ['negative amount', { amount: -10 }],
      ['amount with 3 decimals', { amount: 12.345 }],
      ['amount above 1e9', { amount: 1_000_000_001 }],
    ])('400s for %s', async (_label, override) => {
      const token = await signToken()
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          token,
          body: { ...validCreateBody, ...override },
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400s when isIncome is missing', async () => {
      const token = await signToken()
      const bodyWithoutIsIncome: Record<string, unknown> = {
        ...validCreateBody,
      }
      delete bodyWithoutIsIncome.isIncome

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          token,
          body: bodyWithoutIsIncome,
        })
      )
      expect(response.status).toBe(400)
    })

    it('400s when note exceeds 500 chars', async () => {
      const token = await signToken()
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          token,
          body: { ...validCreateBody, note: 'x'.repeat(501) },
        })
      )
      expect(response.status).toBe(400)
    })

    it('400s (not 500) on a malformed JSON body', async () => {
      const token = await signToken()
      const request = new Request('http://localhost/api/transactions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: '{not json',
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })

    it('201s and bumps the template when templateId is owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id: VALID_CATEGORY_ID,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.transaction.create).mockResolvedValue(makeTx() as never)
      vi.mocked(prisma.template.updateMany).mockResolvedValue({
        count: 1,
      } as never)

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          token,
          body: { ...validCreateBody, templateId: VALID_TEMPLATE_ID },
        })
      )
      expect(response.status).toBe(201)
      expect(prisma.template.updateMany).toHaveBeenCalledWith({
        where: { id: VALID_TEMPLATE_ID, userId: 'user_1' },
        data: { usageCount: { increment: 1 }, lastUsedAt: expect.any(Date) },
      })
    })

    it('201s and still calls updateMany when templateId is foreign (silent no-op)', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id: VALID_CATEGORY_ID,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.transaction.create).mockResolvedValue(makeTx() as never)
      vi.mocked(prisma.template.updateMany).mockResolvedValue({
        count: 0,
      } as never)

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          token,
          body: { ...validCreateBody, templateId: VALID_TEMPLATE_ID },
        })
      )
      expect(response.status).toBe(201)
      expect(prisma.template.updateMany).toHaveBeenCalled()
    })

    it('never calls template.updateMany when templateId is absent', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id: VALID_CATEGORY_ID,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.transaction.create).mockResolvedValue(makeTx() as never)

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          token,
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(201)
      expect(prisma.template.updateMany).not.toHaveBeenCalled()
    })

    it('500s with the standardized envelope on an unexpected service error', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id: VALID_CATEGORY_ID,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.transaction.create).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/transactions', {
          token,
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('GET /api/transactions/:id', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await GET_BY_ID(
        makeRequest('GET', `http://localhost/api/transactions/${VALID_TX_ID}`),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(401)
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET_BY_ID(
        makeRequest('GET', `http://localhost/api/transactions/${VALID_TX_ID}`, {
          token,
        }),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(429)
      expect(prisma.transaction.findFirst).not.toHaveBeenCalled()
    })

    it('400s with "Invalid transaction ID" for a non-cuid id', async () => {
      const token = await signToken()
      const response = await GET_BY_ID(
        makeRequest('GET', 'http://localhost/api/transactions/not-a-cuid', {
          token,
        }),
        { params: Promise.resolve({ id: 'not-a-cuid' }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('Invalid transaction ID')
    })

    it('200s and wraps the transaction when owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue(
        makeTx() as never
      )

      const response = await GET_BY_ID(
        makeRequest('GET', `http://localhost/api/transactions/${VALID_TX_ID}`, {
          token,
        }),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.transaction.id).toBe(VALID_TX_ID)
    })

    it('404s when not owned/unknown', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null)

      const response = await GET_BY_ID(
        makeRequest('GET', `http://localhost/api/transactions/${VALID_TX_ID}`, {
          token,
        }),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Transaction not found',
      })
    })

    it('500s on an unexpected error', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findFirst).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET_BY_ID(
        makeRequest('GET', `http://localhost/api/transactions/${VALID_TX_ID}`, {
          token,
        }),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(500)
    })
  })

  describe('PATCH /api/transactions/:id', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await PATCH(
        makeRequest(
          'PATCH',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { body: { note: 'Updated' } }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.transaction.update).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await PATCH(
        makeRequest(
          'PATCH',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token, body: { note: 'Updated' } }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(429)
      expect(prisma.transaction.update).not.toHaveBeenCalled()
    })

    it('400s with "Invalid transaction ID" for a non-cuid id, before checking the body', async () => {
      const token = await signToken()
      const response = await PATCH(
        makeRequest('PATCH', 'http://localhost/api/transactions/not-a-cuid', {
          token,
          body: {},
        }),
        { params: Promise.resolve({ id: 'not-a-cuid' }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('Invalid transaction ID')
    })

    it('400s with "At least one field must be provided" for an empty body', async () => {
      const token = await signToken()
      const response = await PATCH(
        makeRequest(
          'PATCH',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token, body: {} }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('At least one field must be provided')
    })

    it('400s for amount = -1', async () => {
      const token = await signToken()
      const response = await PATCH(
        makeRequest(
          'PATCH',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token, body: { amount: -1 } }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(400)
    })

    it('404s and never updates when the transaction is unknown/not owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null)

      const response = await PATCH(
        makeRequest(
          'PATCH',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token, body: { note: 'Updated' } }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.transaction.update).not.toHaveBeenCalled()
    })

    it('404s when the patched categoryId belongs to another user, never updates, but checks findFirst', async () => {
      const token = await signToken()
      const otherCategoryId = 'clcat000000000000000000002'
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue(
        makeTx({ categoryId: VALID_CATEGORY_ID }) as never
      )
      vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

      const response = await PATCH(
        makeRequest(
          'PATCH',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token, body: { categoryId: otherCategoryId } }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Category not found',
      })
      expect(prisma.transaction.update).not.toHaveBeenCalled()
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: otherCategoryId, userId: 'user_1' },
      })
    })

    it('200s and skips category.findFirst when the patch categoryId equals the existing categoryId', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue(
        makeTx({ categoryId: VALID_CATEGORY_ID }) as never
      )
      vi.mocked(prisma.transaction.update).mockResolvedValue(
        makeTx({ categoryId: VALID_CATEGORY_ID }) as never
      )

      const response = await PATCH(
        makeRequest(
          'PATCH',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token, body: { categoryId: VALID_CATEGORY_ID } }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(200)
      expect(prisma.category.findFirst).not.toHaveBeenCalled()
    })

    it('200s and wraps the transaction for a normal partial update', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue(
        makeTx() as never
      )
      vi.mocked(prisma.transaction.update).mockResolvedValue(
        makeTx({ note: 'Updated' }) as never
      )

      const response = await PATCH(
        makeRequest(
          'PATCH',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token, body: { note: 'Updated' } }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.transaction.note).toBe('Updated')
    })

    it('500s on an unexpected error', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue(
        makeTx() as never
      )
      vi.mocked(prisma.transaction.update).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await PATCH(
        makeRequest(
          'PATCH',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token, body: { note: 'Updated' } }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(500)
    })
  })

  describe('DELETE /api/transactions/:id', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await DELETE(
        makeRequest(
          'DELETE',
          `http://localhost/api/transactions/${VALID_TX_ID}`
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.transaction.delete).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await DELETE(
        makeRequest(
          'DELETE',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(429)
      expect(prisma.transaction.delete).not.toHaveBeenCalled()
    })

    it('400s with "Invalid transaction ID" for a non-cuid id', async () => {
      const token = await signToken()
      const response = await DELETE(
        makeRequest('DELETE', 'http://localhost/api/transactions/not-a-cuid', {
          token,
        }),
        { params: Promise.resolve({ id: 'not-a-cuid' }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('Invalid transaction ID')
    })

    it('404s when unknown/not owned, never deletes', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null)

      const response = await DELETE(
        makeRequest(
          'DELETE',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.transaction.delete).not.toHaveBeenCalled()
    })

    it('204s with an empty body on success', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue(
        makeTx() as never
      )

      const response = await DELETE(
        makeRequest(
          'DELETE',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(204)
      const text = await response.text()
      expect(text).toBe('')
    })

    it('500s when the rate limiter throws', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await DELETE(
        makeRequest(
          'DELETE',
          `http://localhost/api/transactions/${VALID_TX_ID}`,
          { token }
        ),
        { params: Promise.resolve({ id: VALID_TX_ID }) }
      )
      expect(response.status).toBe(500)
    })
  })
})
