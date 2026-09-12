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
  return `crossuser-ldg-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
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

describe('cross-user authorization: ledger', () => {
  let prisma: typeof import('@/lib/server/prisma').prisma
  let registerRoute: typeof import('@/app/api/auth/register/route').POST
  let peopleGet: typeof import('@/app/api/ledger/people/route').GET
  let personGet: typeof import('@/app/api/ledger/people/[id]/route').GET
  let personPatch: typeof import('@/app/api/ledger/people/[id]/route').PATCH
  let personDelete: typeof import('@/app/api/ledger/people/[id]/route').DELETE
  let entriesGet: typeof import('@/app/api/ledger/people/[id]/entries/route').GET
  let entriesPost: typeof import('@/app/api/ledger/people/[id]/entries/route').POST
  let settlePost: typeof import('@/app/api/ledger/people/[id]/settle/route').POST
  let entryPatch: typeof import('@/app/api/ledger/entries/[id]/route').PATCH
  let entryDelete: typeof import('@/app/api/ledger/entries/[id]/route').DELETE

  let userA: { id: string; token: string }
  let userB: { id: string; token: string }
  let personAId: string
  let entryAId: string

  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/server/prisma'))
    ;({ POST: registerRoute } = await import('@/app/api/auth/register/route'))
    ;({ GET: peopleGet } = await import('@/app/api/ledger/people/route'))
    ;({
      GET: personGet,
      PATCH: personPatch,
      DELETE: personDelete,
    } = await import('@/app/api/ledger/people/[id]/route'))
    ;({ GET: entriesGet, POST: entriesPost } =
      await import('@/app/api/ledger/people/[id]/entries/route'))
    ;({ POST: settlePost } =
      await import('@/app/api/ledger/people/[id]/settle/route'))
    ;({ PATCH: entryPatch, DELETE: entryDelete } =
      await import('@/app/api/ledger/entries/[id]/route'))

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

    const person = await prisma.ledgerPerson.create({
      data: { name: 'Ledger Test Person A', userId: userA.id },
    })
    personAId = person.id

    const entry = await prisma.ledgerEntry.create({
      data: {
        amount: 100,
        type: 'GAVE',
        date: new Date(),
        personId: personAId,
        userId: userA.id,
      },
    })
    entryAId = entry.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    })
    await prisma.$disconnect()
  })

  it("GET as User B on User A's ledger person 404s", async () => {
    const res = await personGet(
      jsonRequest('GET', `http://localhost/api/ledger/people/${personAId}`, {
        token: userB.token,
      }),
      { params: Promise.resolve({ id: personAId }) }
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it("PATCH as User B on User A's ledger person 404s and never mutates it", async () => {
    const res = await personPatch(
      jsonRequest('PATCH', `http://localhost/api/ledger/people/${personAId}`, {
        token: userB.token,
        body: { name: 'Hijacked By B' },
      }),
      { params: Promise.resolve({ id: personAId }) }
    )
    expect(res.status).toBe(404)

    const unchanged = await prisma.ledgerPerson.findUnique({
      where: { id: personAId },
    })
    expect(unchanged?.name).toBe('Ledger Test Person A')
    expect(unchanged?.userId).toBe(userA.id)
  })

  it("GET .../entries as User B on User A's person 404s, never returns entries", async () => {
    const res = await entriesGet(
      jsonRequest(
        'GET',
        `http://localhost/api/ledger/people/${personAId}/entries`,
        { token: userB.token }
      ),
      { params: Promise.resolve({ id: personAId }) }
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.active).toBeUndefined()
    expect(body.settled).toBeUndefined()
  })

  it("POST an entry as User B against User A's person 404s and creates nothing", async () => {
    const before = await prisma.ledgerEntry.count({
      where: { personId: personAId },
    })

    const res = await entriesPost(
      jsonRequest(
        'POST',
        `http://localhost/api/ledger/people/${personAId}/entries`,
        {
          token: userB.token,
          body: {
            amount: 500,
            type: 'RECEIVED',
            date: new Date().toISOString(),
          },
        }
      ),
      { params: Promise.resolve({ id: personAId }) }
    )
    expect(res.status).toBe(404)

    const after = await prisma.ledgerEntry.count({
      where: { personId: personAId },
    })
    expect(after).toBe(before)
  })

  it("settling as User B on User A's person 404s and never settles A's entry", async () => {
    const res = await settlePost(
      jsonRequest(
        'POST',
        `http://localhost/api/ledger/people/${personAId}/settle`,
        { token: userB.token, body: {} }
      ),
      { params: Promise.resolve({ id: personAId }) }
    )
    expect(res.status).toBe(404)

    const entry = await prisma.ledgerEntry.findUnique({
      where: { id: entryAId },
    })
    expect(entry?.settled).toBe(false)
    expect(entry?.settledAt).toBeNull()
  })

  it("PATCH as User B on User A's ledger entry 404s and never mutates it", async () => {
    const res = await entryPatch(
      jsonRequest('PATCH', `http://localhost/api/ledger/entries/${entryAId}`, {
        token: userB.token,
        body: { amount: 1, settled: true },
      }),
      { params: Promise.resolve({ id: entryAId }) }
    )
    expect(res.status).toBe(404)

    const unchanged = await prisma.ledgerEntry.findUnique({
      where: { id: entryAId },
    })
    expect(unchanged?.amount).toBe(100)
    expect(unchanged?.settled).toBe(false)
  })

  it("DELETE as User B on User A's ledger entry 404s and never deletes it", async () => {
    const res = await entryDelete(
      jsonRequest('DELETE', `http://localhost/api/ledger/entries/${entryAId}`, {
        token: userB.token,
      }),
      { params: Promise.resolve({ id: entryAId }) }
    )
    expect(res.status).toBe(404)

    const stillThere = await prisma.ledgerEntry.findUnique({
      where: { id: entryAId },
    })
    expect(stillThere).not.toBeNull()
  })

  it("DELETE as User B on User A's ledger person 404s and never deletes it (with its entries)", async () => {
    const res = await personDelete(
      jsonRequest('DELETE', `http://localhost/api/ledger/people/${personAId}`, {
        token: userB.token,
      }),
      { params: Promise.resolve({ id: personAId }) }
    )
    expect(res.status).toBe(404)

    const stillThere = await prisma.ledgerPerson.findUnique({
      where: { id: personAId },
    })
    expect(stillThere).not.toBeNull()
  })

  it("GET /api/ledger/people list as User B never includes User A's person or balance", async () => {
    const res = await peopleGet(
      jsonRequest('GET', 'http://localhost/api/ledger/people', {
        token: userB.token,
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.people.some((p: { id: string }) => p.id === personAId)).toBe(
      false
    )
  })
})
