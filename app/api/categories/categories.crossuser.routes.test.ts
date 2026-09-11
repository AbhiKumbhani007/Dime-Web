// @vitest-environment node
// authenticate()/auth.service.ts import jose, which needs Node's real
// Uint8Array/CryptoKey realm — jsdom's globals are a different realm and
// fail jose's instanceof checks (see LEARNINGS.md).
//
// Deliberately uses the REAL Prisma client against the local dev Postgres
// database (not a mocked prisma) and calls the REAL route handlers — a
// mocked `findFirst` can't prove the production WHERE clause actually
// scopes by userId. This is exactly the class of bug fixed at 2e58f9c
// (categories' by-category lookup filtered only by `id`, not `userId`).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// Vitest does not auto-load `.env.local` the way Next.js dev/build does —
// `lib/server/prisma.ts` reads `process.env.DATABASE_URL` as a top-level
// side effect of `new PrismaClient()`, so it must be set before that module
// (or anything that imports it) is ever imported. A plain top-level
// `process.env.X = ...` statement placed textually before a *static* import
// in the same file would still run too late — ES modules evaluate the whole
// static import graph before any of the importing module's own top-level
// statements run, regardless of source order. Loading env synchronously here
// (no imports above it) and only reaching route handlers via *dynamic*
// `import()` inside `beforeAll` sidesteps that ordering trap entirely.
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

// Every request in this file carries a unique x-forwarded-for so this file's
// rate-limit bucket (a real Postgres row in the shared dev database) never
// collides with another concurrent test file, dev server, or parallel
// worktree hitting the same 'global:unknown' bucket.
const CLIENT_IP = `10.${rand255()}.${rand255()}.${rand255()}`
function rand255() {
  return Math.floor(Math.random() * 254) + 1
}

function uniqueEmail(label: string) {
  return `crossuser-cat-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
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

describe('cross-user authorization: categories', () => {
  let prisma: typeof import('@/lib/server/prisma').prisma
  let registerRoute: typeof import('@/app/api/auth/register/route').POST
  let categoriesGet: typeof import('@/app/api/categories/route').GET
  let categoriesPatch: typeof import('@/app/api/categories/[id]/route').PATCH
  let categoriesDelete: typeof import('@/app/api/categories/[id]/route').DELETE
  let transactionsPost: typeof import('@/app/api/transactions/route').POST

  let userA: { id: string; token: string }
  let userB: { id: string; token: string }
  let categoryAId: string

  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/server/prisma'))
    ;({ POST: registerRoute } = await import('@/app/api/auth/register/route'))
    ;({ GET: categoriesGet } = await import('@/app/api/categories/route'))
    ;({ PATCH: categoriesPatch, DELETE: categoriesDelete } =
      await import('@/app/api/categories/[id]/route'))
    ;({ POST: transactionsPost } = await import('@/app/api/transactions/route'))

    const resA = await registerRoute(
      jsonRequest('POST', 'http://localhost/api/auth/register', {
        body: { email: uniqueEmail('a'), password: 'correct-horse-1' },
      })
    )
    expect(resA.status).toBe(201)
    const bodyA = await resA.json()
    userA = { id: bodyA.user.id, token: bodyA.accessToken }

    const resB = await registerRoute(
      jsonRequest('POST', 'http://localhost/api/auth/register', {
        body: { email: uniqueEmail('b'), password: 'correct-horse-2' },
      })
    )
    expect(resB.status).toBe(201)
    const bodyB = await resB.json()
    userB = { id: bodyB.user.id, token: bodyB.accessToken }

    // Seeded directly (fast) rather than via the categories POST route —
    // this file's whole point is exercising the PATCH/DELETE/GET-list/
    // transaction-create paths against a category that already exists.
    const category = await prisma.category.create({
      data: {
        name: 'CrossUser Test Category',
        emoji: '🔒',
        userId: userA.id,
      },
    })
    categoryAId = category.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    })
    await prisma.$disconnect()
  })

  it("PATCH as User B on User A's category 404s and never mutates it", async () => {
    const res = await categoriesPatch(
      jsonRequest('PATCH', `http://localhost/api/categories/${categoryAId}`, {
        token: userB.token,
        body: { name: 'Hijacked By B' },
      }),
      { params: Promise.resolve({ id: categoryAId }) }
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')

    const stillOwned = await prisma.category.findUnique({
      where: { id: categoryAId },
    })
    expect(stillOwned?.name).toBe('CrossUser Test Category')
    expect(stillOwned?.userId).toBe(userA.id)
  })

  it("DELETE as User B on User A's category 404s and never deletes it", async () => {
    const res = await categoriesDelete(
      jsonRequest('DELETE', `http://localhost/api/categories/${categoryAId}`, {
        token: userB.token,
      }),
      { params: Promise.resolve({ id: categoryAId }) }
    )
    expect(res.status).toBe(404)

    const stillThere = await prisma.category.findUnique({
      where: { id: categoryAId },
    })
    expect(stillThere).not.toBeNull()
  })

  it("GET /api/categories as User B never includes User A's category", async () => {
    const res = await categoriesGet(
      jsonRequest('GET', 'http://localhost/api/categories', {
        token: userB.token,
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(
      body.categories.some((c: { id: string }) => c.id === categoryAId)
    ).toBe(false)
  })

  it("creating a transaction as User B against User A's categoryId 404s (not silently accepted or misattributed)", async () => {
    const before = await prisma.transaction.count({
      where: { userId: userB.id },
    })

    const res = await transactionsPost(
      jsonRequest('POST', 'http://localhost/api/transactions', {
        token: userB.token,
        body: {
          amount: 12.5,
          date: new Date().toISOString(),
          isIncome: false,
          categoryId: categoryAId,
        },
      })
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')

    const after = await prisma.transaction.count({
      where: { userId: userB.id },
    })
    expect(after).toBe(before)

    const leaked = await prisma.transaction.findFirst({
      where: { categoryId: categoryAId, userId: userB.id },
    })
    expect(leaked).toBeNull()
  })
})
