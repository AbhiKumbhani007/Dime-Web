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
    template: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: { findFirst: vi.fn() },
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

describe('templates routes', () => {
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

  describe('GET /api/templates', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await GET(
        makeRequest('GET', 'http://localhost/api/templates')
      )
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing token',
      })
    })

    it('returns the scoped template list for a valid token, default sort', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.findMany).mockResolvedValue([
        { id: 'tpl1', label: 'Coffee' },
      ] as never)

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/templates', { token })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.templates).toEqual([{ id: 'tpl1', label: 'Coffee' }])
      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user_1' },
          orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
        })
      )
    })

    it('applies the recent sort orderBy', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.findMany).mockResolvedValue([] as never)

      await GET(
        makeRequest('GET', 'http://localhost/api/templates?sort=recent', {
          token,
        })
      )
      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { lastUsedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
        })
      )
    })

    it('applies the label sort orderBy', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.findMany).mockResolvedValue([] as never)

      await GET(
        makeRequest('GET', 'http://localhost/api/templates?sort=label', {
          token,
        })
      )
      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ label: 'asc' }] })
      )
    })

    it('400s with VALIDATION_ERROR and the custom message for an invalid sort value, without calling the service', async () => {
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/templates?sort=bogus', {
          token,
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'sort must be one of usage, recent, label',
      })
      expect(prisma.template.findMany).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/templates', { token })
      )
      expect(response.status).toBe(429)
      expect(prisma.template.findMany).not.toHaveBeenCalled()
    })

    it('500s with the standardized envelope when the rate limiter itself throws', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/templates', { token })
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
      vi.mocked(prisma.template.findMany).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/templates', { token })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('POST /api/templates', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/templates', {
          body: { label: 'Coffee' },
        })
      )
      expect(response.status).toBe(401)
      expect(prisma.template.create).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/templates', {
          token,
          body: { label: 'Coffee' },
        })
      )
      expect(response.status).toBe(429)
      expect(prisma.template.create).not.toHaveBeenCalled()
    })

    it('201s and wraps the created template, defaulting emoji/isIncome when omitted', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.create).mockResolvedValue({
        id: 'tpl1',
        label: 'Coffee',
        emoji: '🧾',
      } as never)

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/templates', {
          token,
          body: { label: 'Coffee' },
        })
      )
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.template.label).toBe('Coffee')
      expect(prisma.template.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emoji: '🧾',
            isIncome: false,
            userId: 'user_1',
          }),
        })
      )
    })

    it('201s when categoryId is omitted — category.findFirst never called', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.create).mockResolvedValue({
        id: 'tpl1',
        label: 'Coffee',
      } as never)

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/templates', {
          token,
          body: { label: 'Coffee' },
        })
      )
      expect(response.status).toBe(201)
      expect(prisma.category.findFirst).not.toHaveBeenCalled()
    })

    it('400s with VALIDATION_ERROR when label is missing', async () => {
      const token = await signToken()
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/templates', {
          token,
          body: {},
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400s with the custom message for a label over 50 characters', async () => {
      const token = await signToken()
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/templates', {
          token,
          body: { label: 'x'.repeat(51) },
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('Label must be at most 50 characters')
    })

    it('400s (not 500) on a malformed JSON body', async () => {
      const token = await signToken()
      const request = new Request('http://localhost/api/templates', {
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

    it('404s NOT_FOUND when categoryId does not resolve for this user, without calling create', async () => {
      const token = await signToken()
      vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/templates', {
          token,
          body: { label: 'Coffee', categoryId: 'cltest0000000000000000001' },
        })
      )
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'Category not found',
      })
      expect(prisma.template.create).not.toHaveBeenCalled()
    })

    it('409s with CONFLICT on a duplicate label', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.create).mockRejectedValue({ code: 'P2002' })

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/templates', {
          token,
          body: { label: 'Coffee' },
        })
      )
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'CONFLICT',
        message: 'A template with this label already exists',
      })
    })
  })

  describe('PATCH /api/templates/:id', () => {
    const patchId = 'cltest0000000000000000000'

    it('401s when the Authorization header is missing', async () => {
      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/templates/${patchId}`, {
          body: { label: 'Latte' },
        }),
        { params: Promise.resolve({ id: patchId }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.template.update).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/templates/${patchId}`, {
          token,
          body: { label: 'Latte' },
        }),
        { params: Promise.resolve({ id: patchId }) }
      )
      expect(response.status).toBe(429)
      expect(prisma.template.update).not.toHaveBeenCalled()
    })

    it('400s with "Invalid template ID" for a non-cuid id, before checking the body', async () => {
      const token = await signToken()
      const response = await PATCH(
        makeRequest('PATCH', 'http://localhost/api/templates/not-a-cuid', {
          token,
          body: {},
        }),
        { params: Promise.resolve({ id: 'not-a-cuid' }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('Invalid template ID')
    })

    it('400s with "At least one field must be provided" for an empty body', async () => {
      const token = await signToken()
      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/templates/${patchId}`, {
          token,
          body: {},
        }),
        { params: Promise.resolve({ id: patchId }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('At least one field must be provided')
    })

    it('404s and never calls update when the template is not owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/templates/${patchId}`, {
          token,
          body: { label: 'Latte' },
        }),
        { params: Promise.resolve({ id: patchId }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.template.update).not.toHaveBeenCalled()
    })

    it('404s "Category not found" when patching in a foreign categoryId, without calling update', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.findFirst).mockResolvedValue({
        id: patchId,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.category.findFirst).mockResolvedValue(null)

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/templates/${patchId}`, {
          token,
          body: { categoryId: 'cltest0000000000000000001' },
        }),
        { params: Promise.resolve({ id: patchId }) }
      )
      expect(response.status).toBe(404)
      const body = await response.json()
      expect(body.error.message).toBe('Category not found')
      expect(prisma.template.update).not.toHaveBeenCalled()
    })

    it('200s and wraps the updated template when owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.findFirst).mockResolvedValue({
        id: patchId,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.template.update).mockResolvedValue({
        id: patchId,
        label: 'Latte',
      } as never)

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/templates/${patchId}`, {
          token,
          body: { label: 'Latte' },
        }),
        { params: Promise.resolve({ id: patchId }) }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.template.label).toBe('Latte')
    })

    it('200s when clearing categoryId via null — category.findFirst never called', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.findFirst).mockResolvedValue({
        id: patchId,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.template.update).mockResolvedValue({
        id: patchId,
        categoryId: null,
      } as never)

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/templates/${patchId}`, {
          token,
          body: { categoryId: null },
        }),
        { params: Promise.resolve({ id: patchId }) }
      )
      expect(response.status).toBe(200)
      expect(prisma.category.findFirst).not.toHaveBeenCalled()
    })

    it('409s with CONFLICT on a duplicate label', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.findFirst).mockResolvedValue({
        id: patchId,
        userId: 'user_1',
      } as never)
      vi.mocked(prisma.template.update).mockRejectedValue({ code: 'P2002' })

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/templates/${patchId}`, {
          token,
          body: { label: 'Latte' },
        }),
        { params: Promise.resolve({ id: patchId }) }
      )
      expect(response.status).toBe(409)
    })
  })

  describe('DELETE /api/templates/:id', () => {
    const id = 'cltest0000000000000000000'

    it('401s when the Authorization header is missing', async () => {
      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/templates/${id}`),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.template.delete).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/templates/${id}`, {
          token,
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(429)
      expect(prisma.template.delete).not.toHaveBeenCalled()
    })

    it('404s when the template is not owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/templates/${id}`, {
          token,
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(404)
    })

    it('204s with an empty body when owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.template.findFirst).mockResolvedValue({
        id,
        userId: 'user_1',
      } as never)

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/templates/${id}`, {
          token,
        }),
        { params: Promise.resolve({ id }) }
      )
      expect(response.status).toBe(204)
      const text = await response.text()
      expect(text).toBe('')
    })

    it('500s with the standardized envelope when the rate limiter itself throws', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/templates/${id}`, {
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
