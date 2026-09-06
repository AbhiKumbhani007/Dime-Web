// @vitest-environment node
// authenticate() imports jose, which needs Node's real Uint8Array/CryptoKey
// realm — jsdom's globals are a different realm and fail jose's instanceof checks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { GET as GET_OVERVIEW } from './overview/route'
import { GET as GET_BY_PERIOD } from './by-period/route'
import { GET as GET_BY_CATEGORY } from './by-category/route'
import { GET as GET_TRENDS } from './trends/route'
import { GET as GET_TOP_DAYS } from './top-days/route'
import { GET as GET_BUDGET_VS_ACTUAL } from './budget-vs-actual/route'
import { prisma } from '@/lib/server/prisma'

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    transaction: {
      groupBy: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
    budget: {
      findMany: vi.fn(),
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

function makeRequest(url: string, { token }: { token?: string } = {}) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new Request(url, { method: 'GET', headers })
}

describe('analytics routes', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.clearAllMocks()
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 1,
    } as never)
    vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)
    vi.mocked(prisma.transaction.count).mockResolvedValue(0 as never)
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.category.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.budget.findMany).mockResolvedValue([] as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('GET /api/analytics/overview', () => {
    const url = 'http://localhost/api/analytics/overview'

    it('401s when the Authorization header is missing', async () => {
      const response = await GET_OVERVIEW(makeRequest(url))
      expect(response.status).toBe(401)
      expect(prisma.transaction.groupBy).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET_OVERVIEW(makeRequest(url, { token }))
      expect(response.status).toBe(429)
      expect(prisma.transaction.groupBy).not.toHaveBeenCalled()
    })

    it('returns the flat overview envelope for a valid token', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue([
        { isIncome: true, _sum: { amount: 500 } },
        { isIncome: false, _sum: { amount: 300 } },
      ] as never)
      vi.mocked(prisma.transaction.count).mockResolvedValue(4 as never)

      const response = await GET_OVERVIEW(
        makeRequest(
          `${url}?from=2026-04-01T00:00:00.000Z&to=2026-04-02T00:00:00.000Z`,
          {
            token,
          }
        )
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      // Flat — no wrapper key, per the live-verified contract.
      expect(body).toMatchObject({
        totalIncome: 500,
        totalExpense: 300,
        netBalance: 200,
        transactionCount: 4,
      })
      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user_1' }),
        })
      )
    })

    it('400s with VALIDATION_ERROR for an unparseable `from`', async () => {
      const token = await signToken()

      const response = await GET_OVERVIEW(
        makeRequest(`${url}?from=not-a-date`, { token })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
      expect(prisma.transaction.groupBy).not.toHaveBeenCalled()
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.groupBy).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET_OVERVIEW(makeRequest(url, { token }))
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('GET /api/analytics/by-period', () => {
    const url = 'http://localhost/api/analytics/by-period'

    it('401s when the Authorization header is missing', async () => {
      const response = await GET_BY_PERIOD(makeRequest(`${url}?period=weekly`))
      expect(response.status).toBe(401)
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET_BY_PERIOD(
        makeRequest(`${url}?period=weekly`, { token })
      )
      expect(response.status).toBe(429)
      expect(prisma.transaction.findMany).not.toHaveBeenCalled()
    })

    it('returns the flat {period,labels,income,expense,net,from,to} envelope', async () => {
      const token = await signToken()

      const response = await GET_BY_PERIOD(
        makeRequest(`${url}?period=weekly&date=2026-04-15T00:00:00.000Z`, {
          token,
        })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.period).toBe('weekly')
      expect(body.labels).toEqual([
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat',
        'Sun',
      ])
      expect(body.income).toHaveLength(7)
      expect(body.expense).toHaveLength(7)
      expect(body.net).toHaveLength(7)
    })

    it('passes categoryId through to the service when given', async () => {
      const token = await signToken()
      const categoryId = 'clcategory0000000000000000000'

      await GET_BY_PERIOD(
        makeRequest(`${url}?period=monthly&categoryId=${categoryId}`, {
          token,
        })
      )
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId }),
        })
      )
    })

    it('400s with VALIDATION_ERROR for a bad `period`', async () => {
      const token = await signToken()

      const response = await GET_BY_PERIOD(
        makeRequest(`${url}?period=bogus`, { token })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('400s with VALIDATION_ERROR for a malformed categoryId', async () => {
      const token = await signToken()

      const response = await GET_BY_PERIOD(
        makeRequest(`${url}?period=weekly&categoryId=not-a-cuid`, { token })
      )
      expect(response.status).toBe(400)
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findMany).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET_BY_PERIOD(
        makeRequest(`${url}?period=weekly`, { token })
      )
      expect(response.status).toBe(500)
    })
  })

  describe('GET /api/analytics/by-category', () => {
    const url = 'http://localhost/api/analytics/by-category'

    it('401s when the Authorization header is missing', async () => {
      const response = await GET_BY_CATEGORY(makeRequest(url))
      expect(response.status).toBe(401)
    })

    it('429s when the rate limit is exceeded', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET_BY_CATEGORY(makeRequest(url, { token }))
      expect(response.status).toBe(429)
    })

    it('returns {categories} wrapping the breakdown rows', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue([
        { categoryId: 'cat1', _sum: { amount: 100 }, _count: 2 },
      ] as never)
      vi.mocked(prisma.category.findMany).mockResolvedValue([
        { id: 'cat1', name: 'Food', emoji: '🍔', color: '#f97316' },
      ] as never)

      const response = await GET_BY_CATEGORY(
        makeRequest(`${url}?isIncome=false`, { token })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.categories).toHaveLength(1)
      expect(body.categories[0].percent).toBe(100)
      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isIncome: false }),
        })
      )
    })

    it('400s with VALIDATION_ERROR for an unparseable `to`', async () => {
      const token = await signToken()

      const response = await GET_BY_CATEGORY(
        makeRequest(`${url}?to=not-a-date`, { token })
      )
      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/analytics/trends', () => {
    const url = 'http://localhost/api/analytics/trends'

    it('401s when the Authorization header is missing', async () => {
      const response = await GET_TRENDS(makeRequest(url))
      expect(response.status).toBe(401)
    })

    it('429s when the rate limit is exceeded', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET_TRENDS(makeRequest(url, { token }))
      expect(response.status).toBe(429)
    })

    it('returns {trends}, defaulting months to 6', async () => {
      const token = await signToken()

      const response = await GET_TRENDS(makeRequest(url, { token }))
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.trends).toHaveLength(6)
    })

    it('honours an explicit `months`', async () => {
      const token = await signToken()

      const response = await GET_TRENDS(
        makeRequest(`${url}?months=3`, { token })
      )
      const body = await response.json()
      expect(body.trends).toHaveLength(3)
    })

    it('400s with VALIDATION_ERROR when `months` exceeds 36', async () => {
      const token = await signToken()

      const response = await GET_TRENDS(
        makeRequest(`${url}?months=37`, { token })
      )
      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/analytics/top-days', () => {
    const url = 'http://localhost/api/analytics/top-days'

    it('401s when the Authorization header is missing', async () => {
      const response = await GET_TOP_DAYS(makeRequest(url))
      expect(response.status).toBe(401)
    })

    it('429s when the rate limit is exceeded', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET_TOP_DAYS(makeRequest(url, { token }))
      expect(response.status).toBe(429)
    })

    it('returns {days}, sorted and capped at `limit`, expenses only', async () => {
      const token = await signToken()
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([
        { amount: 100, date: new Date(2026, 3, 1) },
        { amount: 900, date: new Date(2026, 3, 7) },
      ] as never)

      const response = await GET_TOP_DAYS(
        makeRequest(`${url}?limit=1`, { token })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.days).toEqual([{ date: '2026-04-07', total: 900 }])
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isIncome: false }),
        })
      )
    })

    it('400s with VALIDATION_ERROR when `limit` exceeds 100', async () => {
      const token = await signToken()

      const response = await GET_TOP_DAYS(
        makeRequest(`${url}?limit=101`, { token })
      )
      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/analytics/budget-vs-actual', () => {
    const url = 'http://localhost/api/analytics/budget-vs-actual'

    it('401s when the Authorization header is missing', async () => {
      const response = await GET_BUDGET_VS_ACTUAL(makeRequest(url))
      expect(response.status).toBe(401)
      expect(prisma.budget.findMany).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET_BUDGET_VS_ACTUAL(makeRequest(url, { token }))
      expect(response.status).toBe(429)
      expect(prisma.budget.findMany).not.toHaveBeenCalled()
    })

    it('returns {budgets} mapped into the narrower vs-actual shape, reusing listBudgets', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findMany).mockResolvedValue([
        {
          id: 'b1',
          name: 'Groceries',
          emoji: '🛒',
          type: 'MONTHLY',
          amount: 10000,
          categoryId: 'cat1',
          startDate: new Date('2026-01-01'),
        },
      ] as never)
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue([
        { categoryId: 'cat1', _sum: { amount: 4000 } },
      ] as never)

      const response = await GET_BUDGET_VS_ACTUAL(makeRequest(url, { token }))
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.budgets).toEqual([
        {
          budget: { id: 'b1', name: 'Groceries', emoji: '🛒', type: 'MONTHLY' },
          allocated: 10000,
          spent: 4000,
          remaining: 6000,
          percent: 40,
        },
      ])
    })

    it('500s with the standardized envelope when the reused budgets service throws', async () => {
      const token = await signToken()
      vi.mocked(prisma.budget.findMany).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET_BUDGET_VS_ACTUAL(makeRequest(url, { token }))
      expect(response.status).toBe(500)
    })
  })
})
