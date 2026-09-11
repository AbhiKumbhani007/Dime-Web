// @vitest-environment node
// Real Prisma client against the local dev Postgres database + real route
// handlers — see app/api/categories/categories.crossuser.routes.test.ts for
// the full rationale (a mocked `findFirst`/`groupBy` can't prove the
// production WHERE clause actually scopes by userId, the class of bug fixed
// at 2e58f9c). Analytics is the highest-risk surface for a *silent* leak
// (an aggregate that quietly folds in another user's totals rather than
// 404ing), so every test here seeds BOTH users with real, distinguishable
// data and asserts the responding user's numbers never include the other's.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

function loadDotEnvLocal() {
  const path = join(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '')
  }
}
loadDotEnvLocal()

const CLIENT_IP = `10.${rand255()}.${rand255()}.${rand255()}`
function rand255() {
  return Math.floor(Math.random() * 254) + 1
}

function uniqueEmail(label: string) {
  return `crossuser-an-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
}

function jsonRequest(
  method: string,
  url: string,
  { token, body }: { token?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = { 'x-forwarded-for': CLIENT_IP }
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('cross-user authorization: analytics', () => {
  let prisma: typeof import('@/lib/server/prisma').prisma
  let registerRoute: typeof import('@/app/api/auth/register/route').POST
  let overviewGet: typeof import('@/app/api/analytics/overview/route').GET
  let byPeriodGet: typeof import('@/app/api/analytics/by-period/route').GET
  let byCategoryGet: typeof import('@/app/api/analytics/by-category/route').GET
  let trendsGet: typeof import('@/app/api/analytics/trends/route').GET
  let topDaysGet: typeof import('@/app/api/analytics/top-days/route').GET
  let budgetVsActualGet: typeof import('@/app/api/analytics/budget-vs-actual/route').GET

  let userA: { id: string; token: string }
  let userB: { id: string; token: string }
  let categoryAId: string
  let categoryBId: string
  // Deliberately the SAME calendar day for both users, so a query that
  // aggregated across userId boundaries (e.g. a forgotten `userId` in a
  // groupBy `where`) would show up as an inflated total instead of just an
  // empty result.
  const sharedDay = new Date()
  sharedDay.setUTCHours(12, 0, 0, 0)

  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/server/prisma'))
    ;({ POST: registerRoute } = await import('@/app/api/auth/register/route'))
    ;({ GET: overviewGet } = await import('@/app/api/analytics/overview/route'))
    ;({ GET: byPeriodGet } =
      await import('@/app/api/analytics/by-period/route'))
    ;({ GET: byCategoryGet } =
      await import('@/app/api/analytics/by-category/route'))
    ;({ GET: trendsGet } = await import('@/app/api/analytics/trends/route'))
    ;({ GET: topDaysGet } = await import('@/app/api/analytics/top-days/route'))
    ;({ GET: budgetVsActualGet } =
      await import('@/app/api/analytics/budget-vs-actual/route'))

    const resA = await registerRoute(
      jsonRequest('POST', 'http://localhost/api/auth/register', {
        body: { email: uniqueEmail('a'), password: 'correct-horse-1' },
      })
    )
    const bodyA = await resA.json()
    userA = { id: bodyA.user.id, token: bodyA.accessToken }

    const resB = await registerRoute(
      jsonRequest('POST', 'http://localhost/api/auth/register', {
        body: { email: uniqueEmail('b'), password: 'correct-horse-2' },
      })
    )
    const bodyB = await resB.json()
    userB = { id: bodyB.user.id, token: bodyB.accessToken }

    const catA = await prisma.category.create({
      data: {
        name: 'Analytics Test Category A',
        emoji: '🔒',
        userId: userA.id,
      },
    })
    categoryAId = catA.id

    const catB = await prisma.category.create({
      data: {
        name: 'Analytics Test Category B',
        emoji: '🔓',
        userId: userB.id,
      },
    })
    categoryBId = catB.id

    // User A: a big expense (1000) on the shared day — this is the number
    // that must NEVER show up in any of User B's analytics responses below.
    await prisma.transaction.create({
      data: {
        amount: 1000,
        date: sharedDay,
        isIncome: false,
        categoryId: categoryAId,
        userId: userA.id,
      },
    })

    // User B: a small expense (10) on the same day.
    await prisma.transaction.create({
      data: {
        amount: 10,
        date: sharedDay,
        isIncome: false,
        categoryId: categoryBId,
        userId: userB.id,
      },
    })

    await prisma.budget.create({
      data: {
        name: 'Analytics Test Budget A',
        emoji: '💰',
        type: 'MONTHLY',
        amount: 5000,
        categoryId: categoryAId,
        userId: userA.id,
      },
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    })
    await prisma.$disconnect()
  })

  it("overview as User B reflects only User B's totals, never User A's", async () => {
    const res = await overviewGet(
      jsonRequest('GET', 'http://localhost/api/analytics/overview', {
        token: userB.token,
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalExpense).toBe(10)
    expect(body.transactionCount).toBe(1)
  })

  it("by-category as User B, filtered by User A's categoryId, returns empty rather than leaking User A's spend", async () => {
    const res = await byCategoryGet(
      jsonRequest('GET', 'http://localhost/api/analytics/by-category', {
        token: userB.token,
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.categories).toHaveLength(1)
    expect(body.categories[0].category.id).toBe(categoryBId)
    expect(body.categories[0].total).toBe(10)
    // Never includes User A's category row.
    expect(
      body.categories.some(
        (c: { category: { id: string } | null }) =>
          c.category?.id === categoryAId
      )
    ).toBe(false)
  })

  it("by-period as User B on the shared day sums only User B's spend, not User A's", async () => {
    const dateParam = encodeURIComponent(sharedDay.toISOString())
    const res = await byPeriodGet(
      jsonRequest(
        'GET',
        `http://localhost/api/analytics/by-period?period=monthly&date=${dateParam}`,
        { token: userB.token }
      )
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const totalExpense = (body.expense as number[]).reduce(
      (sum, v) => sum + v,
      0
    )
    expect(totalExpense).toBe(10)
  })

  it("by-period as User B filtered by User A's categoryId returns all-zero buckets, not User A's data", async () => {
    const dateParam = encodeURIComponent(sharedDay.toISOString())
    const res = await byPeriodGet(
      jsonRequest(
        'GET',
        `http://localhost/api/analytics/by-period?period=monthly&date=${dateParam}&categoryId=${categoryAId}`,
        { token: userB.token }
      )
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const totalExpense = (body.expense as number[]).reduce(
      (sum, v) => sum + v,
      0
    )
    expect(totalExpense).toBe(0)
  })

  it("trends as User B reflects only User B's monthly totals, not User A's", async () => {
    const res = await trendsGet(
      jsonRequest('GET', 'http://localhost/api/analytics/trends?months=1', {
        token: userB.token,
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    const totalExpense = (body.trends as Array<{ expense: number }>).reduce(
      (sum, row) => sum + row.expense,
      0
    )
    expect(totalExpense).toBe(10)
  })

  it("top-days as User B on the shared day totals only User B's spend, not the combined 1010", async () => {
    const res = await topDaysGet(
      jsonRequest('GET', 'http://localhost/api/analytics/top-days', {
        token: userB.token,
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    for (const day of body.days as Array<{ total: number }>) {
      expect(day.total).not.toBe(1010)
      expect(day.total).toBeLessThanOrEqual(10)
    }
  })

  it("budget-vs-actual as User B never includes User A's budget", async () => {
    const res = await budgetVsActualGet(
      jsonRequest('GET', 'http://localhost/api/analytics/budget-vs-actual', {
        token: userB.token,
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.budgets).toEqual([])
  })
})
