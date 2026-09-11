// @vitest-environment node
// Real Prisma client against the local dev Postgres database + real route
// handlers — see app/api/categories/categories.crossuser.routes.test.ts for
// the full rationale (a mocked `findFirst` can't prove the production WHERE
// clause actually scopes by userId, the class of bug fixed at 2e58f9c).
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
  return `crossuser-bud-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
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

describe('cross-user authorization: budgets', () => {
  let prisma: typeof import('@/lib/server/prisma').prisma
  let registerRoute: typeof import('@/app/api/auth/register/route').POST
  let budgetsGet: typeof import('@/app/api/budgets/route').GET
  let budgetsPost: typeof import('@/app/api/budgets/route').POST
  let budgetPatch: typeof import('@/app/api/budgets/[id]/route').PATCH
  let budgetDelete: typeof import('@/app/api/budgets/[id]/route').DELETE
  let budgetProgressGet: typeof import('@/app/api/budgets/[id]/progress/route').GET

  let userA: { id: string; token: string }
  let userB: { id: string; token: string }
  let categoryAId: string
  let categoryBId: string
  let budgetAId: string

  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/server/prisma'))
    ;({ POST: registerRoute } = await import('@/app/api/auth/register/route'))
    ;({ GET: budgetsGet, POST: budgetsPost } =
      await import('@/app/api/budgets/route'))
    ;({ PATCH: budgetPatch, DELETE: budgetDelete } =
      await import('@/app/api/budgets/[id]/route'))
    ;({ GET: budgetProgressGet } =
      await import('@/app/api/budgets/[id]/progress/route'))

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
      data: { name: 'Budget Test Category A', emoji: '🔒', userId: userA.id },
    })
    categoryAId = catA.id

    const catB = await prisma.category.create({
      data: { name: 'Budget Test Category B', emoji: '🔓', userId: userB.id },
    })
    categoryBId = catB.id

    const budget = await prisma.budget.create({
      data: {
        name: 'Budget Test A',
        emoji: '💰',
        type: 'MONTHLY',
        amount: 500,
        categoryId: categoryAId,
        userId: userA.id,
      },
    })
    budgetAId = budget.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    })
    await prisma.$disconnect()
  })

  it("PATCH as User B on User A's budget 404s and never mutates it", async () => {
    const res = await budgetPatch(
      jsonRequest('PATCH', `http://localhost/api/budgets/${budgetAId}`, {
        token: userB.token,
        body: { amount: 99999 },
      }),
      { params: Promise.resolve({ id: budgetAId }) }
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')

    const unchanged = await prisma.budget.findUnique({
      where: { id: budgetAId },
    })
    expect(unchanged?.amount).toBe(500)
    expect(unchanged?.userId).toBe(userA.id)
  })

  it("GET .../progress as User B on User A's budget 404s, never returns spend data", async () => {
    const res = await budgetProgressGet(
      jsonRequest('GET', `http://localhost/api/budgets/${budgetAId}/progress`, {
        token: userB.token,
      }),
      { params: Promise.resolve({ id: budgetAId }) }
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.budget).toBeUndefined()
    expect(body.spent).toBeUndefined()
  })

  it("DELETE as User B on User A's budget 404s and never deletes it", async () => {
    const res = await budgetDelete(
      jsonRequest('DELETE', `http://localhost/api/budgets/${budgetAId}`, {
        token: userB.token,
      }),
      { params: Promise.resolve({ id: budgetAId }) }
    )
    expect(res.status).toBe(404)

    const stillThere = await prisma.budget.findUnique({
      where: { id: budgetAId },
    })
    expect(stillThere).not.toBeNull()
  })

  it('creating a budget with a foreign categoryId 404s and creates nothing', async () => {
    const before = await prisma.budget.count({ where: { userId: userB.id } })

    const res = await budgetsPost(
      jsonRequest('POST', 'http://localhost/api/budgets', {
        token: userB.token,
        body: {
          name: 'Sneaky Budget',
          emoji: '🕵️',
          type: 'MONTHLY',
          amount: 100,
          categoryId: categoryAId,
        },
      })
    )
    expect(res.status).toBe(404)

    const after = await prisma.budget.count({ where: { userId: userB.id } })
    expect(after).toBe(before)
  })

  it("User A cannot repoint their own budget's categoryId at User B's category via PATCH", async () => {
    const res = await budgetPatch(
      jsonRequest('PATCH', `http://localhost/api/budgets/${budgetAId}`, {
        token: userA.token,
        body: { categoryId: categoryBId },
      }),
      { params: Promise.resolve({ id: budgetAId }) }
    )
    expect(res.status).toBe(404)

    const unchanged = await prisma.budget.findUnique({
      where: { id: budgetAId },
    })
    expect(unchanged?.categoryId).toBe(categoryAId)
  })

  it("GET /api/budgets list as User B never includes User A's budget", async () => {
    const res = await budgetsGet(
      jsonRequest('GET', 'http://localhost/api/budgets', { token: userB.token })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.budgets.some((b: { id: string }) => b.id === budgetAId)).toBe(
      false
    )
  })
})
