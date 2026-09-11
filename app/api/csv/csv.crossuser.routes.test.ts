// @vitest-environment node
// Real Prisma client against the local dev Postgres database + real route
// handlers — see app/api/categories/categories.crossuser.routes.test.ts for
// the full rationale. This file owns the route-level "does export/import
// ever read or write another user's rows" angle (the preview-token signature
// check itself belongs to the CSV domain's own test suite).
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
  return `crossuser-csv-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
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

function getRequest(url: string, token: string) {
  return new Request(url, {
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': CLIENT_IP },
  })
}

function multipartRequest(
  url: string,
  token: string,
  fields: Record<string, string>,
  file: { name: string; content: string }
) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  form.append('file', new File([file.content], file.name, { type: 'text/csv' }))
  return new Request(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': CLIENT_IP },
    body: form,
  })
}

describe('cross-user authorization: csv', () => {
  let prisma: typeof import('@/lib/server/prisma').prisma
  let registerRoute: typeof import('@/app/api/auth/register/route').POST
  let exportGet: typeof import('@/app/api/csv/export/route').GET
  let previewPost: typeof import('@/app/api/csv/import/preview/route').POST
  let commitPost: typeof import('@/app/api/csv/import/commit/route').POST

  let userA: { id: string; token: string }
  let userB: { id: string; token: string }
  let categoryAId: string
  let categoryBId: string

  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/server/prisma'))
    ;({ POST: registerRoute } = await import('@/app/api/auth/register/route'))
    ;({ GET: exportGet } = await import('@/app/api/csv/export/route'))
    ;({ POST: previewPost } =
      await import('@/app/api/csv/import/preview/route'))
    ;({ POST: commitPost } = await import('@/app/api/csv/import/commit/route'))

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
      data: { name: 'CSV Test Category Only A', emoji: '🔒', userId: userA.id },
    })
    categoryAId = catA.id

    const catB = await prisma.category.create({
      data: { name: 'CSV Test Category Only B', emoji: '🔓', userId: userB.id },
    })
    categoryBId = catB.id

    // A distinctive, greppable note so a leak is trivially detectable in the
    // raw CSV text rather than relying only on row counts.
    await prisma.transaction.create({
      data: {
        amount: 777.77,
        date: new Date('2026-01-15T00:00:00.000Z'),
        isIncome: false,
        note: 'USER_A_ONLY_SECRET_NOTE',
        categoryId: categoryAId,
        userId: userA.id,
      },
    })

    await prisma.transaction.create({
      data: {
        amount: 5.5,
        date: new Date('2026-01-16T00:00:00.000Z'),
        isIncome: false,
        note: 'user b own note',
        categoryId: categoryBId,
        userId: userB.id,
      },
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    })
    await prisma.$disconnect()
  })

  it("export as User B never contains User A's transaction rows", async () => {
    const res = await exportGet(
      getRequest('http://localhost/api/csv/export', userB.token)
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('USER_A_ONLY_SECRET_NOTE')
    expect(text).not.toContain('777.77')
    expect(text).not.toContain('CSV Test Category Only A')
    expect(text).toContain('user b own note')

    const dataLines = text
      .split('\r\n')
      .filter((l) => l.length > 0)
      .slice(1) // drop the header row
    expect(dataLines).toHaveLength(1)
  })

  it("export as User A never contains User B's transaction rows", async () => {
    const res = await exportGet(
      getRequest('http://localhost/api/csv/export', userA.token)
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('user b own note')
    expect(text).not.toContain('CSV Test Category Only B')
    expect(text).toContain('USER_A_ONLY_SECRET_NOTE')
  })

  it("a commit using User A's previewToken but User B's bearer token 400s and imports nothing into User B's account", async () => {
    const csvContent =
      'Date,Amount,Type,Category,Note\r\n2026-02-01,20.00,Expense,CSV Test Category Only A,stolen import\r\n'

    const previewRes = await previewPost(
      multipartRequest(
        'http://localhost/api/csv/import/preview',
        userA.token,
        {},
        { name: 'import.csv', content: csvContent }
      )
    )
    expect(previewRes.status).toBe(200)
    const previewBody = await previewRes.json()
    expect(previewBody.readyCount).toBe(1)

    const bBefore = await prisma.transaction.count({
      where: { userId: userB.id },
    })

    const commitRes = await commitPost(
      multipartRequest(
        'http://localhost/api/csv/import/commit',
        userB.token,
        { previewToken: previewBody.previewToken },
        { name: 'import.csv', content: csvContent }
      )
    )
    expect(commitRes.status).toBe(400)
    const commitBody = await commitRes.json()
    expect(commitBody.error.code).toBe('VALIDATION_ERROR')

    const bAfter = await prisma.transaction.count({
      where: { userId: userB.id },
    })
    expect(bAfter).toBe(bBefore)
  })

  it("importing a CSV row whose category name only exists for User A never cross-matches into User B's category", async () => {
    // categoryByName is built from a userId-scoped query in csv.service.ts's
    // classifyFile() — this proves a name collision never resolves against
    // another user's category id.
    const csvContent = `Date,Amount,Type,Category,Note\r\n2026-02-02,15.00,Expense,${'CSV Test Category Only A'},should not match\r\n`

    const res = await previewPost(
      multipartRequest(
        'http://localhost/api/csv/import/preview',
        userB.token,
        {},
        { name: 'import2.csv', content: csvContent }
      )
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.readyCount).toBe(0)
    expect(body.errorCount).toBe(1)
    expect(body.errors[0].code).toBe('UNKNOWN_CATEGORY')
  })
})
