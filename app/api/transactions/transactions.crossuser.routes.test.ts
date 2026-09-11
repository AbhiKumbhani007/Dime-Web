// @vitest-environment node
// Real Prisma client against the local dev Postgres database + real route
// handlers — see categories.crossuser.routes.test.ts for the full rationale
// (a mocked `findFirst` can't prove the production WHERE clause actually
// scopes by userId, which is exactly the class of bug fixed at 2e58f9c).
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
  return `crossuser-txn-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
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

describe('cross-user authorization: transactions', () => {
  let prisma: typeof import('@/lib/server/prisma').prisma
  let registerRoute: typeof import('@/app/api/auth/register/route').POST
  let txGet: typeof import('@/app/api/transactions/[id]/route').GET
  let txPatch: typeof import('@/app/api/transactions/[id]/route').PATCH
  let txDelete: typeof import('@/app/api/transactions/[id]/route').DELETE
  let txPost: typeof import('@/app/api/transactions/route').POST

  let userA: { id: string; token: string }
  let userB: { id: string; token: string }
  let categoryAId: string
  let categoryBId: string
  let templateAId: string
  let transactionAId: string

  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/server/prisma'))
    ;({ POST: registerRoute } = await import('@/app/api/auth/register/route'))
    ;({
      GET: txGet,
      PATCH: txPatch,
      DELETE: txDelete,
    } = await import('@/app/api/transactions/[id]/route'))
    ;({ POST: txPost } = await import('@/app/api/transactions/route'))

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
      data: { name: 'Txn Test Category A', emoji: '🔒', userId: userA.id },
    })
    categoryAId = catA.id

    const catB = await prisma.category.create({
      data: { name: 'Txn Test Category B', emoji: '🔓', userId: userB.id },
    })
    categoryBId = catB.id

    const template = await prisma.template.create({
      data: {
        label: 'Txn Test Template A',
        userId: userA.id,
        categoryId: categoryAId,
        usageCount: 0,
      },
    })
    templateAId = template.id

    const transaction = await prisma.transaction.create({
      data: {
        amount: 42.5,
        date: new Date(),
        isIncome: false,
        note: 'User A secret transaction',
        categoryId: categoryAId,
        userId: userA.id,
      },
    })
    transactionAId = transaction.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    })
    await prisma.$disconnect()
  })

  it("GET as User B on User A's transaction 404s, never returns the row", async () => {
    const res = await txGet(
      jsonRequest(
        'GET',
        `http://localhost/api/transactions/${transactionAId}`,
        {
          token: userB.token,
        }
      ),
      { params: Promise.resolve({ id: transactionAId }) }
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it("PATCH as User B on User A's transaction 404s and never mutates it", async () => {
    const res = await txPatch(
      jsonRequest(
        'PATCH',
        `http://localhost/api/transactions/${transactionAId}`,
        {
          token: userB.token,
          body: { amount: 999.99, note: 'Hijacked by B' },
        }
      ),
      { params: Promise.resolve({ id: transactionAId }) }
    )
    expect(res.status).toBe(404)

    const unchanged = await prisma.transaction.findUnique({
      where: { id: transactionAId },
    })
    expect(unchanged?.amount).toBe(42.5)
    expect(unchanged?.note).toBe('User A secret transaction')
    expect(unchanged?.userId).toBe(userA.id)
  })

  it("DELETE as User B on User A's transaction 404s and never deletes it", async () => {
    const res = await txDelete(
      jsonRequest(
        'DELETE',
        `http://localhost/api/transactions/${transactionAId}`,
        {
          token: userB.token,
        }
      ),
      { params: Promise.resolve({ id: transactionAId }) }
    )
    expect(res.status).toBe(404)

    const stillThere = await prisma.transaction.findUnique({
      where: { id: transactionAId },
    })
    expect(stillThere).not.toBeNull()
  })

  it('creating a transaction with a foreign categoryId 404s and creates nothing', async () => {
    const before = await prisma.transaction.count({
      where: { userId: userB.id },
    })

    const res = await txPost(
      jsonRequest('POST', 'http://localhost/api/transactions', {
        token: userB.token,
        body: {
          amount: 5,
          date: new Date().toISOString(),
          isIncome: false,
          categoryId: categoryAId,
        },
      })
    )
    expect(res.status).toBe(404)

    const after = await prisma.transaction.count({
      where: { userId: userB.id },
    })
    expect(after).toBe(before)
  })

  it("User A cannot repoint their own transaction's categoryId at User B's category via PATCH", async () => {
    const res = await txPatch(
      jsonRequest(
        'PATCH',
        `http://localhost/api/transactions/${transactionAId}`,
        {
          token: userA.token,
          body: { categoryId: categoryBId },
        }
      ),
      { params: Promise.resolve({ id: transactionAId }) }
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')

    const unchanged = await prisma.transaction.findUnique({
      where: { id: transactionAId },
    })
    expect(unchanged?.categoryId).toBe(categoryAId)
  })

  it("creating a transaction with another user's templateId silently skips the usage bump instead of erroring or crediting the wrong user's template", async () => {
    // Documented, intentional behaviour (see transactions.service.ts's
    // comment on createTransaction): templateId is a write-time signal only,
    // scoped to the CALLER's userId, so a foreign template silently no-ops.
    // This test exists to catch a regression where that scoping is dropped
    // and a cross-user side effect (bumping someone else's usage counter)
    // becomes possible.
    const before = await prisma.template.findUniqueOrThrow({
      where: { id: templateAId },
    })
    expect(before.usageCount).toBe(0)

    const res = await txPost(
      jsonRequest('POST', 'http://localhost/api/transactions', {
        token: userB.token,
        body: {
          amount: 7,
          date: new Date().toISOString(),
          isIncome: false,
          categoryId: categoryBId,
          templateId: templateAId,
        },
      })
    )
    // The transaction itself is still valid and succeeds...
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.transaction.userId).toBe(userB.id)

    // ...but User A's template must be completely untouched.
    const after = await prisma.template.findUniqueOrThrow({
      where: { id: templateAId },
    })
    expect(after.usageCount).toBe(0)
    expect(after.lastUsedAt).toBeNull()
  })

  it("GET /api/transactions list as User B never includes User A's rows even when filtered by User A's categoryId", async () => {
    const { GET: txListGet } = await import('@/app/api/transactions/route')
    const res = await txListGet(
      jsonRequest(
        'GET',
        `http://localhost/api/transactions?categoryId=${categoryAId}`,
        { token: userB.token }
      )
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([])
  })
})
