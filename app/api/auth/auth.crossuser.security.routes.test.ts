// @vitest-environment node
// Real Prisma client against the local dev Postgres database + real route
// handlers — see app/api/categories/categories.crossuser.routes.test.ts for
// the full rationale. This file confirms `/api/auth/me` (GET/PATCH/DELETE)
// and `/api/auth/me/password` always derive the target user from the
// bearer token itself — never from any client-controlled field — and that a
// structurally-valid-but-orphaned token (user deleted after issuance)
// degrades to a clean 404 instead of a 500 or a leak.
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
  return `crossuser-auth-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
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

describe('cross-user authorization: auth /me', () => {
  let prisma: typeof import('@/lib/server/prisma').prisma
  let registerRoute: typeof import('@/app/api/auth/register/route').POST
  let meGet: typeof import('@/app/api/auth/me/route').GET
  let mePatch: typeof import('@/app/api/auth/me/route').PATCH
  let meDelete: typeof import('@/app/api/auth/me/route').DELETE
  let passwordPatch: typeof import('@/app/api/auth/me/password/route').PATCH

  let userA: { id: string; token: string; email: string }
  let userB: { id: string; token: string; email: string }

  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/server/prisma'))
    ;({ POST: registerRoute } = await import('@/app/api/auth/register/route'))
    ;({
      GET: meGet,
      PATCH: mePatch,
      DELETE: meDelete,
    } = await import('@/app/api/auth/me/route'))
    ;({ PATCH: passwordPatch } =
      await import('@/app/api/auth/me/password/route'))

    const emailA = uniqueEmail('a')
    const resA = await registerRoute(
      jsonRequest('POST', 'http://localhost/api/auth/register', {
        body: {
          email: emailA,
          password: 'correct-horse-1',
          name: 'Original A',
        },
      })
    )
    const bodyA = await resA.json()
    userA = { id: bodyA.user.id, token: bodyA.accessToken, email: emailA }

    const emailB = uniqueEmail('b')
    const resB = await registerRoute(
      jsonRequest('POST', 'http://localhost/api/auth/register', {
        body: {
          email: emailB,
          password: 'correct-horse-2',
          name: 'Original B',
        },
      })
    )
    const bodyB = await resB.json()
    userB = { id: bodyB.user.id, token: bodyB.accessToken, email: emailB }
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    })
    await prisma.$disconnect()
  })

  it("PATCH /me as User B with an 'id'/'userId' field pointed at User A only ever updates User B, never User A", async () => {
    const res = await mePatch(
      jsonRequest('PATCH', 'http://localhost/api/auth/me', {
        token: userB.token,
        body: {
          id: userA.id,
          userId: userA.id,
          name: 'Renamed via injected id',
        },
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    // The updated profile returned is User B's own — id is derived from the
    // token, the injected `id`/`userId` body fields are dropped by the zod
    // schema (which only recognises name/theme) before ever reaching the
    // service layer.
    expect(body.id).toBe(userB.id)
    expect(body.name).toBe('Renamed via injected id')

    const userARow = await prisma.user.findUnique({ where: { id: userA.id } })
    expect(userARow?.name).toBe('Original A')
  })

  it("PATCH /me/password as User B with an injected 'userId' field only ever changes User B's password", async () => {
    const beforeA = await prisma.user.findUniqueOrThrow({
      where: { id: userA.id },
    })

    const res = await passwordPatch(
      jsonRequest('PATCH', 'http://localhost/api/auth/me/password', {
        token: userB.token,
        body: {
          userId: userA.id,
          oldPassword: 'correct-horse-2',
          newPassword: 'brand-new-password-for-b',
        },
      })
    )
    expect(res.status).toBe(200)

    const afterA = await prisma.user.findUniqueOrThrow({
      where: { id: userA.id },
    })
    expect(afterA.passwordHash).toBe(beforeA.passwordHash)

    // Confirm it actually changed B's own password, by logging in with it.
    const { POST: loginRoute } = await import('@/app/api/auth/login/route')
    const loginRes = await loginRoute(
      jsonRequest('POST', 'http://localhost/api/auth/login', {
        body: { email: userB.email, password: 'brand-new-password-for-b' },
      })
    )
    expect(loginRes.status).toBe(200)
  })

  it("DELETE /me as User B with a foreign userId in the query string only ever deletes User B's own account", async () => {
    const res = await meDelete(
      jsonRequest(
        'DELETE',
        `http://localhost/api/auth/me?userId=${userA.id}&id=${userA.id}`,
        { token: userB.token }
      )
    )
    expect(res.status).toBe(204)

    const userBRow = await prisma.user.findUnique({ where: { id: userB.id } })
    expect(userBRow).toBeNull()

    const userARow = await prisma.user.findUnique({ where: { id: userA.id } })
    expect(userARow).not.toBeNull()
  })

  it('GET /me with a structurally valid token for an already-deleted user 404s cleanly (no 500, no stale data)', async () => {
    const email = uniqueEmail('orphan')
    const res = await registerRoute(
      jsonRequest('POST', 'http://localhost/api/auth/register', {
        body: { email, password: 'correct-horse-3' },
      })
    )
    const body = await res.json()
    const orphanId: string = body.user.id
    const orphanToken: string = body.accessToken

    // Simulate the account having been deleted (e.g. via DELETE /me on
    // another device) while this access token is still within its 15m TTL.
    await prisma.user.delete({ where: { id: orphanId } })

    const meRes = await meGet(
      jsonRequest('GET', 'http://localhost/api/auth/me', {
        token: orphanToken,
      })
    )
    expect(meRes.status).toBe(404)
    const meBody = await meRes.json()
    expect(meBody.error.code).toBe('NOT_FOUND')
  })
})
