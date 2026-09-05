// @vitest-environment node
// authenticate() imports jose, which needs Node's real Uint8Array/CryptoKey
// realm — jsdom's globals are a different realm and fail jose's instanceof checks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { GET, POST } from './route'
import { PATCH, DELETE } from './[id]/route'
import { prisma } from '@/lib/server/prisma'

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    transaction: { count: vi.fn() },
    budget: { count: vi.fn() },
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

describe('categories routes', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.clearAllMocks()
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 1,
    } as never)
    vi.mocked(prisma.transaction.count).mockResolvedValue(0)
    vi.mocked(prisma.budget.count).mockResolvedValue(0)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('GET /api/categories', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await GET(
        makeRequest('GET', 'http://localhost/api/categories')
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
        makeRequest('GET', 'http://localhost/api/categories', { token })
      )
      expect(response.status).toBe(401)
    })

    it('returns the scoped category list for a valid token', async () => {
      const token = await signToken({
        userId: 'user_1',
        email: 'a@example.com',
      })
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: 'cat1', name: 'Food' },
      ] as never)

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/categories', { token })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.categories).toEqual([{ id: 'cat1', name: 'Food' }])
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user_1' } })
      )
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/categories', { token })
      )
      expect(response.status).toBe(429)
      const body = await response.json()
      expect(body.error.code).toBe('RATE_LIMITED')
      expect(prisma.category.findMany).not.toHaveBeenCalled()
    })

    it('500s with the standardized envelope when the rate limiter itself throws, rather than crashing', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/categories', { token })
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
      vi.mocked(prisma.category.findMany).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/categories', { token })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('POST /api/categories', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/categories', {
          body: { name: 'Food', emoji: '🍔' },
        })
      )
      expect(response.status).toBe(401)
      expect(prisma.category.create).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/categories', {
          token,
          body: { name: 'Food', emoji: '🍔' },
        })
      )
      expect(response.status).toBe(429)
      expect(prisma.category.create).not.toHaveBeenCalled()
    })

    it('201s and wraps the created category, defaulting color when omitted', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.create).mockResolvedValue({
        id: 'cat1',
        name: 'Food',
        color: '#6366f1',
      } as never)

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/categories', {
          token,
          body: { name: 'Food', emoji: '🍔' },
        })
      )
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.category.name).toBe('Food')
      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ color: '#6366f1', userId: 'user_1' }),
        })
      )
    })

    it('400s with VALIDATION_ERROR when a required field is missing', async () => {
      const token = await signToken()
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/categories', {
          token,
          body: { name: 'Food' },
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400s with the custom message for an invalid hex color', async () => {
      const token = await signToken()
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/categories', {
          token,
          body: { name: 'Food', emoji: '🍔', color: 'notacolor' },
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe(
        'Color must be a valid hex color (e.g. #6366f1)'
      )
    })

    it('400s (not 500) on a malformed JSON body', async () => {
      const token = await signToken()
      const request = new Request('http://localhost/api/categories', {
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

    it('409s with CONFLICT on a duplicate name', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.create).mockRejectedValue({ code: 'P2002' })

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/categories', {
          token,
          body: { name: 'Food', emoji: '🍔' },
        })
      )
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'CONFLICT',
        message: 'A category with this name already exists',
      })
    })
  })

  describe('PATCH /api/categories/:id', () => {
    const patchId = 'cltest0000000000000000000'

    it('401s when the Authorization header is missing', async () => {
      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/categories/${patchId}`, {
          body: { name: 'Groceries' },
        }),
        { params: Promise.resolve({ id: patchId }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.category.update).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/categories/${patchId}`, {
          token,
          body: { name: 'Groceries' },
        }),
        { params: Promise.resolve({ id: patchId }) }
      )
      expect(response.status).toBe(429)
      expect(prisma.category.update).not.toHaveBeenCalled()
    })

    it('400s with "Invalid category ID" for a non-cuid id, before checking the body', async () => {
      const token = await signToken()
      const response = await PATCH(
        makeRequest('PATCH', 'http://localhost/api/categories/not-a-cuid', {
          token,
          body: {},
        }),
        { params: Promise.resolve({ id: 'not-a-cuid' }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('Invalid category ID')
    })

    it('400s with "At least one field must be provided" for an empty body', async () => {
      const token = await signToken()
      const id = 'cltest0000000000000000000'
      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/categories/${id}`, {
          token,
          body: {},
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('At least one field must be provided')
    })

    it('404s and never calls update when the category is not owned', async () => {
      const token = await signToken()
      const id = 'cltest0000000000000000000'
      vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/categories/${id}`, {
          token,
          body: { name: 'Groceries' },
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.category.update).not.toHaveBeenCalled()
    })

    it('200s and wraps the updated category when owned', async () => {
      const token = await signToken()
      const id = 'cltest0000000000000000000'
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.category.update).mockResolvedValue({
        id,
        name: 'Groceries',
      } as never)

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/categories/${id}`, {
          token,
          body: { name: 'Groceries' },
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.category.name).toBe('Groceries')
    })

    it('409s with CONFLICT on a duplicate name', async () => {
      const token = await signToken()
      const id = 'cltest0000000000000000000'
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.category.update).mockRejectedValue({ code: 'P2002' })

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/categories/${id}`, {
          token,
          body: { name: 'Groceries' },
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(409)
    })
  })

  describe('DELETE /api/categories/:id', () => {
    const id = 'cltest0000000000000000000'

    it('401s when the Authorization header is missing', async () => {
      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/categories/${id}`),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.category.delete).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/categories/${id}`, {
          token,
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(429)
      expect(prisma.category.delete).not.toHaveBeenCalled()
    })

    it('404s when the category is not owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/categories/${id}`, {
          token,
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(404)
    })

    it('409s when referenced by a transaction', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.transaction.count).mockResolvedValue(2)

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/categories/${id}`, {
          token,
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error.message).toBe(
        'Category is used by existing transactions'
      )
      expect(prisma.category.delete).not.toHaveBeenCalled()
    })

    it('409s when referenced only by a budget, with no transactions', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.transaction.count).mockResolvedValue(0)
      vi.mocked(prisma.budget.count).mockResolvedValue(1)

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/categories/${id}`, {
          token,
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(409)
      expect(prisma.category.delete).not.toHaveBeenCalled()
    })

    it('204s with an empty body when unreferenced', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue({
        id,
        userId: 'user_1',
      } as never)

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/categories/${id}`, {
          token,
        }),
        { params: Promise.resolve({ id }) }
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
        makeRequest('DELETE', `http://localhost/api/categories/${id}`, {
          token,
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      })
    })
  })
})
