// @vitest-environment node
// authenticate() imports jose, which needs Node's real Uint8Array/CryptoKey
// realm — jsdom's globals are a different realm and fail jose's instanceof checks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { GET, POST } from './route'
import { PATCH, DELETE } from './[id]/route'
import { GET as GET_PROGRESS } from './[id]/progress/route'
import { prisma } from '@/lib/server/prisma'

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    budget: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
    transaction: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    rateLimitBucket: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

const TEST_SECRET = 'test-jwt-access-secret-at-least-32-characters-long'

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

const budgetId = 'cltest0000000000000000000'
const categoryId = 'clcat00000000000000000000'

const validCreateBody = {
  name: 'Groceries',
  emoji: '🛒',
  type: 'MONTHLY',
  amount: 500,
  categoryId,
}

const ownedBudgetFixture = {
  id: budgetId,
  userId: 'user_1',
  name: 'Groceries',
  emoji: '🛒',
  colour: '#6366f1',
  type: 'MONTHLY',
  amount: 500,
  categoryId,
  startDate: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  category: { id: categoryId, name: 'Food' },
}

describe('budgets routes', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.clearAllMocks()
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 1,
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('GET /api/budgets', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await GET(
        makeRequest('GET', 'http://localhost/api/budgets')
      )
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing token',
      })
      expect(prisma.budget.findMany).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/budgets', { token })
      )
      expect(response.status).toBe(429)
      const body = await response.json()
      expect(body.error.code).toBe('RATE_LIMITED')
      expect(prisma.budget.findMany).not.toHaveBeenCalled()
    })

    it('returns the scoped budget list for a valid token', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findMany).mockResolvedValue([
        ownedBudgetFixture,
      ] as never)
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue([
        { categoryId, _sum: { amount: 120 } },
      ] as never)

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/budgets', { token })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.budgets).toHaveLength(1)
      expect(body.budgets[0].id).toBe(budgetId)
      expect(prisma.budget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user_1' } })
      )
    })

    it('500s with the standardized envelope when the rate limiter itself throws, rather than crashing', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/budgets', { token })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      })
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findMany).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/budgets', { token })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('POST /api/budgets', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/budgets', {
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(401)
      expect(prisma.budget.create).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/budgets', {
          token,
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(429)
      expect(prisma.budget.create).not.toHaveBeenCalled()
    })

    it('201s and wraps the created budget in {budget}', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id: categoryId,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.budget.create).mockResolvedValue(
        ownedBudgetFixture as never
      )

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/budgets', {
          token,
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.budget.name).toBe('Groceries')
    })

    it('400s with VALIDATION_ERROR when a required field is missing', async () => {
      const token = await signToken()
      const { name: _name, ...bodyMissingName } = validCreateBody
      void _name

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/budgets', {
          token,
          body: bodyMissingName,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(prisma.budget.create).not.toHaveBeenCalled()
    })

    it('400s with the custom message for an invalid hex colour', async () => {
      const token = await signToken()

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/budgets', {
          token,
          body: { ...validCreateBody, colour: 'notacolor' },
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe(
        'Colour must be a valid hex colour (e.g. #6366f1)'
      )
    })

    it('400s for an invalid type enum value', async () => {
      const token = await signToken()

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/budgets', {
          token,
          body: { ...validCreateBody, type: 'NOT_A_TYPE' },
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400s (not 500) on a malformed JSON body', async () => {
      const token = await signToken()
      const request = new Request('http://localhost/api/budgets', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: '{not json',
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
      expect(prisma.budget.create).not.toHaveBeenCalled()
    })

    it('404s when the categoryId is not owned by the user, and never calls create', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/budgets', {
          token,
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(404)
      expect(prisma.budget.create).not.toHaveBeenCalled()
    })

    it('500s with the standardized envelope when the rate limiter itself throws, rather than crashing', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/budgets', {
          token,
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      })
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id: categoryId,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.budget.create).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/budgets', {
          token,
          body: validCreateBody,
        })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('PATCH /api/budgets/:id', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/budgets/${budgetId}`, {
          body: { name: 'Rent' },
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.budget.update).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/budgets/${budgetId}`, {
          token,
          body: { name: 'Rent' },
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(429)
      expect(prisma.budget.update).not.toHaveBeenCalled()
    })

    it('400s with "Invalid budget ID" for a non-cuid id, before checking the body', async () => {
      const token = await signToken()

      const response = await PATCH(
        makeRequest('PATCH', 'http://localhost/api/budgets/not-a-cuid', {
          token,
          body: {},
        }),
        { params: Promise.resolve({ id: 'not-a-cuid' }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('Invalid budget ID')
    })

    it('400s with "At least one field must be provided" for an empty body', async () => {
      const token = await signToken()

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/budgets/${budgetId}`, {
          token,
          body: {},
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('At least one field must be provided')
    })

    it('404s and never calls update when the budget is not owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(null)

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/budgets/${budgetId}`, {
          token,
          body: { name: 'Rent' },
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.budget.update).not.toHaveBeenCalled()
    })

    it('404s and never calls update when the patch categoryId is not owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(
        ownedBudgetFixture as never
      )
      vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/budgets/${budgetId}`, {
          token,
          body: { categoryId: 'clother0000000000000000000' },
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.budget.update).not.toHaveBeenCalled()
    })

    it('200s and wraps the updated budget in {budget} when owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(
        ownedBudgetFixture as never
      )
      vi.mocked(prisma.budget.update).mockResolvedValue({
        ...ownedBudgetFixture,
        name: 'Rent',
      } as never)

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/budgets/${budgetId}`, {
          token,
          body: { name: 'Rent' },
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.budget.name).toBe('Rent')
    })

    it('500s with the standardized envelope when the rate limiter itself throws, rather than crashing', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/budgets/${budgetId}`, {
          token,
          body: { name: 'Rent' },
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      })
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(
        ownedBudgetFixture as never
      )
      vi.mocked(prisma.budget.update).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/budgets/${budgetId}`, {
          token,
          body: { name: 'Rent' },
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('DELETE /api/budgets/:id', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/budgets/${budgetId}`),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.budget.delete).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/budgets/${budgetId}`, {
          token,
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(429)
      expect(prisma.budget.delete).not.toHaveBeenCalled()
    })

    it('404s when the budget is not owned, and never calls delete', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(null)

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/budgets/${budgetId}`, {
          token,
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.budget.delete).not.toHaveBeenCalled()
    })

    it('204s with an empty body when owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(
        ownedBudgetFixture as never
      )

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/budgets/${budgetId}`, {
          token,
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(204)
      const text = await response.text()
      expect(text).toBe('')
    })

    it('500s with the standardized envelope when the rate limiter itself throws, rather than crashing', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/budgets/${budgetId}`, {
          token,
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      })
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(
        ownedBudgetFixture as never
      )
      vi.mocked(prisma.budget.delete).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/budgets/${budgetId}`, {
          token,
        }),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('GET /api/budgets/:id/progress', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await GET_PROGRESS(
        makeRequest('GET', `http://localhost/api/budgets/${budgetId}/progress`),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.budget.findFirst).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET_PROGRESS(
        makeRequest(
          'GET',
          `http://localhost/api/budgets/${budgetId}/progress`,
          { token }
        ),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(429)
      expect(prisma.budget.findFirst).not.toHaveBeenCalled()
    })

    it('400s with "Invalid budget ID" for a non-cuid id', async () => {
      const token = await signToken()

      const response = await GET_PROGRESS(
        makeRequest('GET', 'http://localhost/api/budgets/not-a-cuid/progress', {
          token,
        }),
        { params: Promise.resolve({ id: 'not-a-cuid' }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('Invalid budget ID')
    })

    it('404s when the budget is not found', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(null)

      const response = await GET_PROGRESS(
        makeRequest(
          'GET',
          `http://localhost/api/budgets/${budgetId}/progress`,
          { token }
        ),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(404)
    })

    it('200s with the budget merged alongside the flat progress fields', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(
        ownedBudgetFixture as never
      )
      vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
        _sum: { amount: 100 },
      } as never)

      const response = await GET_PROGRESS(
        makeRequest(
          'GET',
          `http://localhost/api/budgets/${budgetId}/progress`,
          { token }
        ),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.budget).toBeDefined()
      expect(body.budget.id).toBe(budgetId)
      expect(typeof body.spent).toBe('number')
      expect(typeof body.remaining).toBe('number')
      expect(typeof body.percent).toBe('number')
      expect(typeof body.daysRemaining).toBe('number')
      expect(typeof body.periodStart).toBe('string')
      expect(typeof body.periodEnd).toBe('string')
      expect(body.progress).toBeUndefined()
    })

    it('500s with the standardized envelope when the rate limiter itself throws, rather than crashing', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await GET_PROGRESS(
        makeRequest(
          'GET',
          `http://localhost/api/budgets/${budgetId}/progress`,
          { token }
        ),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      })
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(
        ownedBudgetFixture as never
      )
      vi.mocked(prisma.transaction.aggregate).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET_PROGRESS(
        makeRequest(
          'GET',
          `http://localhost/api/budgets/${budgetId}/progress`,
          { token }
        ),
        { params: Promise.resolve({ id: budgetId }) }
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
