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
  return `crossuser-tpl-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
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

describe('cross-user authorization: templates', () => {
  let prisma: typeof import('@/lib/server/prisma').prisma
  let registerRoute: typeof import('@/app/api/auth/register/route').POST
  let templatesGet: typeof import('@/app/api/templates/route').GET
  let templatesPost: typeof import('@/app/api/templates/route').POST
  let templatePatch: typeof import('@/app/api/templates/[id]/route').PATCH
  let templateDelete: typeof import('@/app/api/templates/[id]/route').DELETE

  let userA: { id: string; token: string }
  let userB: { id: string; token: string }
  let categoryAId: string
  let categoryBId: string
  let templateAId: string

  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/server/prisma'))
    ;({ POST: registerRoute } = await import('@/app/api/auth/register/route'))
    ;({ GET: templatesGet, POST: templatesPost } =
      await import('@/app/api/templates/route'))
    ;({ PATCH: templatePatch, DELETE: templateDelete } =
      await import('@/app/api/templates/[id]/route'))

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
      data: { name: 'Template Test Category A', emoji: '🔒', userId: userA.id },
    })
    categoryAId = catA.id

    const catB = await prisma.category.create({
      data: { name: 'Template Test Category B', emoji: '🔓', userId: userB.id },
    })
    categoryBId = catB.id

    const template = await prisma.template.create({
      data: {
        label: 'Template Test A',
        userId: userA.id,
        categoryId: categoryAId,
      },
    })
    templateAId = template.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    })
    await prisma.$disconnect()
  })

  it("PATCH as User B on User A's template 404s and never mutates it", async () => {
    const res = await templatePatch(
      jsonRequest('PATCH', `http://localhost/api/templates/${templateAId}`, {
        token: userB.token,
        body: { label: 'Hijacked By B' },
      }),
      { params: Promise.resolve({ id: templateAId }) }
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')

    const unchanged = await prisma.template.findUnique({
      where: { id: templateAId },
    })
    expect(unchanged?.label).toBe('Template Test A')
    expect(unchanged?.userId).toBe(userA.id)
  })

  it("DELETE as User B on User A's template 404s and never deletes it", async () => {
    const res = await templateDelete(
      jsonRequest('DELETE', `http://localhost/api/templates/${templateAId}`, {
        token: userB.token,
      }),
      { params: Promise.resolve({ id: templateAId }) }
    )
    expect(res.status).toBe(404)

    const stillThere = await prisma.template.findUnique({
      where: { id: templateAId },
    })
    expect(stillThere).not.toBeNull()
  })

  it('creating a template with a foreign categoryId 404s and creates nothing', async () => {
    const before = await prisma.template.count({ where: { userId: userB.id } })

    const res = await templatesPost(
      jsonRequest('POST', 'http://localhost/api/templates', {
        token: userB.token,
        body: { label: 'Sneaky Template', categoryId: categoryAId },
      })
    )
    expect(res.status).toBe(404)

    const after = await prisma.template.count({ where: { userId: userB.id } })
    expect(after).toBe(before)
  })

  it("User A cannot repoint their own template's categoryId at User B's category via PATCH", async () => {
    const res = await templatePatch(
      jsonRequest('PATCH', `http://localhost/api/templates/${templateAId}`, {
        token: userA.token,
        body: { categoryId: categoryBId },
      }),
      { params: Promise.resolve({ id: templateAId }) }
    )
    expect(res.status).toBe(404)

    const unchanged = await prisma.template.findUnique({
      where: { id: templateAId },
    })
    expect(unchanged?.categoryId).toBe(categoryAId)
  })

  it("GET /api/templates list as User B never includes User A's template", async () => {
    const res = await templatesGet(
      jsonRequest('GET', 'http://localhost/api/templates', {
        token: userB.token,
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(
      body.templates.some((t: { id: string }) => t.id === templateAId)
    ).toBe(false)
  })
})
