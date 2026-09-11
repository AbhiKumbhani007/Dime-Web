// @vitest-environment node
// authenticate() imports jose, which needs Node's real Uint8Array/CryptoKey
// realm — jsdom's globals are a different realm and fail jose's instanceof checks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { GET, POST } from './people/route'
import { GET as GET_PERSON, PATCH, DELETE } from './people/[id]/route'
import {
  GET as GET_ENTRIES,
  POST as POST_ENTRY,
} from './people/[id]/entries/route'
import { POST as POST_SETTLE } from './people/[id]/settle/route'
import {
  PATCH as PATCH_ENTRY,
  DELETE as DELETE_ENTRY,
} from './entries/[id]/route'
import { prisma } from '@/lib/server/prisma'

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    ledgerPerson: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    ledgerEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi
      .fn()
      .mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma)),
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

const personId = 'clperson0000000000000000001'
const otherPersonId = 'clperson0000000000000000099'
const entryId = 'clentry00000000000000000001'
const NOW = new Date('2026-01-01T00:00:00.000Z')

function makePerson(overrides: Record<string, unknown> = {}) {
  return {
    id: personId,
    name: 'Priya',
    phone: null,
    note: null,
    color: '#6366f1',
    userId: 'user_1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: entryId,
    amount: 500,
    type: 'GAVE',
    date: NOW,
    note: null,
    settled: false,
    settledAt: null,
    personId,
    userId: 'user_1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

// A zero-balance computeBalances() round trip.
function mockZeroBalance(people: unknown[]) {
  vi.mocked(prisma.ledgerPerson.findMany).mockResolvedValueOnce(people as never)
  vi.mocked(prisma.ledgerEntry.groupBy)
    .mockResolvedValueOnce([] as never) // active sums
    .mockResolvedValueOnce([] as never) // settled counts
    .mockResolvedValueOnce([] as never) // last activity
}

describe('ledger routes', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', TEST_SECRET)
    vi.clearAllMocks()
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 1,
    } as never)
    vi.mocked(prisma.$transaction).mockImplementation(((
      cb: (tx: unknown) => unknown
    ) => cb(prisma)) as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('GET /api/ledger/people', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await GET(
        makeRequest('GET', 'http://localhost/api/ledger/people')
      )
      expect(response.status).toBe(401)
      expect(prisma.ledgerPerson.findMany).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/ledger/people', { token })
      )
      expect(response.status).toBe(429)
      expect(prisma.ledgerPerson.findMany).not.toHaveBeenCalled()
    })

    it('200s with {people, summary} for a valid token', async () => {
      const token = await signToken()
      mockZeroBalance([makePerson()])

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/ledger/people', { token })
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.people).toHaveLength(1)
      expect(body.people[0].direction).toBe('SETTLED')
      expect(body).toHaveProperty('summary')
      expect(body.summary.personCount).toBe(1)
      expect(
        vi.mocked(prisma.ledgerPerson.findMany).mock.calls[0]?.[0]
      ).toMatchObject({
        where: { userId: 'user_1' },
      })
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findMany).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET(
        makeRequest('GET', 'http://localhost/api/ledger/people', { token })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      })
    })
  })

  describe('POST /api/ledger/people', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/ledger/people', {
          body: { name: 'Priya' },
        })
      )
      expect(response.status).toBe(401)
      expect(prisma.ledgerPerson.create).not.toHaveBeenCalled()
    })

    it('429s when the rate limit is exceeded, without calling the service', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
        count: 101,
      } as never)
      const token = await signToken()

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/ledger/people', {
          token,
          body: { name: 'Priya' },
        })
      )
      expect(response.status).toBe(429)
      expect(prisma.ledgerPerson.create).not.toHaveBeenCalled()
    })

    it('creates a person → 201 wraps it in {person}', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(null) // no dup
      vi.mocked(prisma.ledgerPerson.create).mockResolvedValueOnce(
        makePerson() as never
      )
      mockZeroBalance([makePerson()])

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/ledger/people', {
          token,
          body: { name: 'Priya' },
        })
      )
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.person.name).toBe('Priya')
      expect(
        vi.mocked(prisma.ledgerPerson.create).mock.calls[0]?.[0]
      ).toMatchObject({
        data: { userId: 'user_1', color: '#6366f1' },
      })
    })

    it('duplicate name (case-insensitive) → 409 CONFLICT, create never called', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(
        makePerson({ name: 'priya' }) as never
      )

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/ledger/people', {
          token,
          body: { name: 'PRIYA' },
        })
      )
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'CONFLICT',
        message: 'A person with this name already exists',
      })
      expect(prisma.ledgerPerson.create).not.toHaveBeenCalled()
    })

    it('missing name → 400 VALIDATION_ERROR', async () => {
      const token = await signToken()
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/ledger/people', {
          token,
          body: {},
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })

    it('invalid color → 400 with the custom message', async () => {
      const token = await signToken()
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/ledger/people', {
          token,
          body: { name: 'Priya', color: 'notacolor' },
        })
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe(
        'Color must be a valid hex color (e.g. #6366f1)'
      )
    })

    it('invalid phone → 400', async () => {
      const token = await signToken()
      const response = await POST(
        makeRequest('POST', 'http://localhost/api/ledger/people', {
          token,
          body: { name: 'Priya', phone: 'abc' },
        })
      )
      expect(response.status).toBe(400)
    })

    it('400s (not 500) on malformed JSON', async () => {
      const token = await signToken()
      const request = new Request('http://localhost/api/ledger/people', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: '{not json',
      })
      const response = await POST(request)
      expect(response.status).toBe(400)
      expect(prisma.ledgerPerson.create).not.toHaveBeenCalled()
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(null)
      vi.mocked(prisma.ledgerPerson.create).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await POST(
        makeRequest('POST', 'http://localhost/api/ledger/people', {
          token,
          body: { name: 'Priya' },
        })
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('GET /api/ledger/people/:id', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await GET_PERSON(
        makeRequest('GET', `http://localhost/api/ledger/people/${personId}`),
        {
          params: Promise.resolve({ id: personId }),
        }
      )
      expect(response.status).toBe(401)
    })

    it('400s with "Invalid person ID" for a non-cuid id', async () => {
      const token = await signToken()
      const response = await GET_PERSON(
        makeRequest('GET', 'http://localhost/api/ledger/people/not-a-cuid', {
          token,
        }),
        { params: Promise.resolve({ id: 'not-a-cuid' }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('Invalid person ID')
    })

    it('200s and wraps the owned person in {person}', async () => {
      const token = await signToken()
      mockZeroBalance([makePerson()])

      const response = await GET_PERSON(
        makeRequest('GET', `http://localhost/api/ledger/people/${personId}`, {
          token,
        }),
        {
          params: Promise.resolve({ id: personId }),
        }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.person.id).toBe(personId)
    })

    it("404s (not 403 or 200-empty) for another user's person", async () => {
      const token = await signToken()
      mockZeroBalance([]) // computeBalances finds nobody for this id/user

      const response = await GET_PERSON(
        makeRequest(
          'GET',
          `http://localhost/api/ledger/people/${otherPersonId}`,
          { token }
        ),
        { params: Promise.resolve({ id: otherPersonId }) }
      )
      expect(response.status).toBe(404)
    })

    it('500s with the standardized envelope when the service throws unexpectedly', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findMany).mockRejectedValue(
        new Error('connection lost')
      )

      const response = await GET_PERSON(
        makeRequest('GET', `http://localhost/api/ledger/people/${personId}`, {
          token,
        }),
        {
          params: Promise.resolve({ id: personId }),
        }
      )
      expect(response.status).toBe(500)
    })
  })

  describe('PATCH /api/ledger/people/:id', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/ledger/people/${personId}`, {
          body: { note: 'x' },
        }),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.ledgerPerson.update).not.toHaveBeenCalled()
    })

    it('empty body → 400', async () => {
      const token = await signToken()
      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/ledger/people/${personId}`, {
          token,
          body: {},
        }),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error.message).toBe('At least one field must be provided')
    })

    it('updates and wraps the result in {person}', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(
        makePerson() as never
      ) // ownership
      vi.mocked(prisma.ledgerPerson.update).mockResolvedValueOnce(
        makePerson({ note: 'Roommate' }) as never
      )
      mockZeroBalance([makePerson({ note: 'Roommate' })])

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/ledger/people/${personId}`, {
          token,
          body: { note: 'Roommate' },
        }),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.person.note).toBe('Roommate')
    })

    it('phone: null clears the field', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(
        makePerson({ phone: '+911234567890' }) as never
      )
      vi.mocked(prisma.ledgerPerson.update).mockResolvedValueOnce(
        makePerson({ phone: null }) as never
      )
      mockZeroBalance([makePerson({ phone: null })])

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/ledger/people/${personId}`, {
          token,
          body: { phone: null },
        }),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(200)
      expect(
        vi.mocked(prisma.ledgerPerson.update).mock.calls[0]?.[0]
      ).toMatchObject({ data: { phone: null } })
    })

    it("another user's person → 404, update never called", async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(null)

      const response = await PATCH(
        makeRequest(
          'PATCH',
          `http://localhost/api/ledger/people/${otherPersonId}`,
          { token, body: { name: 'X' } }
        ),
        { params: Promise.resolve({ id: otherPersonId }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.ledgerPerson.update).not.toHaveBeenCalled()
    })

    it('renaming to a name already used by another person → 409, update never called', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst)
        .mockResolvedValueOnce(makePerson() as never) // ownership check passes
        .mockResolvedValueOnce(
          makePerson({ id: otherPersonId, name: 'Priya' }) as never
        ) // dup check

      const response = await PATCH(
        makeRequest('PATCH', `http://localhost/api/ledger/people/${personId}`, {
          token,
          body: { name: 'Priya' },
        }),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(409)
      expect(prisma.ledgerPerson.update).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /api/ledger/people/:id', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await DELETE(
        makeRequest('DELETE', `http://localhost/api/ledger/people/${personId}`),
        {
          params: Promise.resolve({ id: personId }),
        }
      )
      expect(response.status).toBe(401)
    })

    it('204s with an empty body when owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(
        makePerson() as never
      )

      const response = await DELETE(
        makeRequest(
          'DELETE',
          `http://localhost/api/ledger/people/${personId}`,
          { token }
        ),
        {
          params: Promise.resolve({ id: personId }),
        }
      )
      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
    })

    it("another user's person → 404, delete never called", async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(null)

      const response = await DELETE(
        makeRequest(
          'DELETE',
          `http://localhost/api/ledger/people/${otherPersonId}`,
          { token }
        ),
        { params: Promise.resolve({ id: otherPersonId }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.ledgerPerson.delete).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/ledger/people/:id/entries', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await GET_ENTRIES(
        makeRequest(
          'GET',
          `http://localhost/api/ledger/people/${personId}/entries`
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(401)
    })

    it('partitions entries into active/settled alongside {person}', async () => {
      const token = await signToken()
      mockZeroBalance([makePerson()])
      vi.mocked(prisma.ledgerEntry.findMany).mockResolvedValueOnce([
        makeEntry({ id: 'e1', settled: false }),
        makeEntry({ id: 'e2', settled: true, settledAt: NOW }),
      ] as never)

      const response = await GET_ENTRIES(
        makeRequest(
          'GET',
          `http://localhost/api/ledger/people/${personId}/entries`,
          { token }
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.active).toHaveLength(1)
      expect(body.settled).toHaveLength(1)
      expect(body.person.id).toBe(personId)
    })

    it("another user's person → 404", async () => {
      const token = await signToken()
      mockZeroBalance([])

      const response = await GET_ENTRIES(
        makeRequest(
          'GET',
          `http://localhost/api/ledger/people/${otherPersonId}/entries`,
          { token }
        ),
        { params: Promise.resolve({ id: otherPersonId }) }
      )
      expect(response.status).toBe(404)
    })
  })

  describe('POST /api/ledger/people/:id/entries', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await POST_ENTRY(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${personId}/entries`,
          {
            body: { amount: 500, type: 'GAVE', date: NOW.toISOString() },
          }
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled()
    })

    it('creates an entry → 201 {entry, person}', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(
        makePerson() as never
      ) // ownership
      vi.mocked(prisma.ledgerEntry.create).mockResolvedValueOnce(
        makeEntry() as never
      )
      mockZeroBalance([makePerson()])

      const response = await POST_ENTRY(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${personId}/entries`,
          {
            token,
            body: { amount: 500, type: 'GAVE', date: NOW.toISOString() },
          }
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.entry.amount).toBe(500)
      expect(body).toHaveProperty('person')
    })

    it("another user's person → 404, create never called", async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(null)

      const response = await POST_ENTRY(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${otherPersonId}/entries`,
          {
            token,
            body: { amount: 500, type: 'GAVE', date: NOW.toISOString() },
          }
        ),
        { params: Promise.resolve({ id: otherPersonId }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled()
    })

    it('invalid type → 400', async () => {
      const token = await signToken()
      const response = await POST_ENTRY(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${personId}/entries`,
          {
            token,
            body: { amount: 500, type: 'LOANED', date: NOW.toISOString() },
          }
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(400)
    })

    it('negative amount → 400', async () => {
      const token = await signToken()
      const response = await POST_ENTRY(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${personId}/entries`,
          {
            token,
            body: { amount: -5, type: 'GAVE', date: NOW.toISOString() },
          }
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(400)
    })
  })

  describe('PATCH /api/ledger/entries/:id', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await PATCH_ENTRY(
        makeRequest('PATCH', `http://localhost/api/ledger/entries/${entryId}`, {
          body: { amount: 10 },
        }),
        { params: Promise.resolve({ id: entryId }) }
      )
      expect(response.status).toBe(401)
    })

    it("updates an entry → 200 {entry, person} with the person's balance recomputed", async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerEntry.findFirst).mockResolvedValueOnce(
        makeEntry() as never
      )
      vi.mocked(prisma.ledgerEntry.update).mockResolvedValueOnce(
        makeEntry({ amount: 750 }) as never
      )
      mockZeroBalance([makePerson()])

      const response = await PATCH_ENTRY(
        makeRequest('PATCH', `http://localhost/api/ledger/entries/${entryId}`, {
          token,
          body: { amount: 750 },
        }),
        { params: Promise.resolve({ id: entryId }) }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.entry.amount).toBe(750)
      expect(body.person.id).toBe(personId)
    })

    it('settled: false un-settles the entry and nulls settledAt', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerEntry.findFirst).mockResolvedValueOnce(
        makeEntry({ settled: true, settledAt: NOW }) as never
      )
      vi.mocked(prisma.ledgerEntry.update).mockResolvedValueOnce(
        makeEntry({ settled: false, settledAt: null }) as never
      )
      mockZeroBalance([makePerson()])

      const response = await PATCH_ENTRY(
        makeRequest('PATCH', `http://localhost/api/ledger/entries/${entryId}`, {
          token,
          body: { settled: false },
        }),
        { params: Promise.resolve({ id: entryId }) }
      )
      expect(response.status).toBe(200)
      expect(
        vi.mocked(prisma.ledgerEntry.update).mock.calls[0]?.[0]
      ).toMatchObject({
        data: { settled: false, settledAt: null },
      })
    })

    it('settled: true stamps settledAt', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerEntry.findFirst).mockResolvedValueOnce(
        makeEntry({ settled: false }) as never
      )
      vi.mocked(prisma.ledgerEntry.update).mockResolvedValueOnce(
        makeEntry({ settled: true, settledAt: NOW }) as never
      )
      mockZeroBalance([makePerson()])

      const response = await PATCH_ENTRY(
        makeRequest('PATCH', `http://localhost/api/ledger/entries/${entryId}`, {
          token,
          body: { settled: true },
        }),
        { params: Promise.resolve({ id: entryId }) }
      )
      expect(response.status).toBe(200)
      const updateArgs = vi.mocked(prisma.ledgerEntry.update).mock
        .calls[0]?.[0] as { data: { settledAt: unknown } }
      expect(updateArgs.data.settledAt).toBeInstanceOf(Date)
    })

    it("another user's entry → 404, update never called", async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerEntry.findFirst).mockResolvedValueOnce(null)

      const response = await PATCH_ENTRY(
        makeRequest('PATCH', `http://localhost/api/ledger/entries/${entryId}`, {
          token,
          body: { amount: 10 },
        }),
        { params: Promise.resolve({ id: entryId }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.ledgerEntry.update).not.toHaveBeenCalled()
    })

    it('empty body → 400', async () => {
      const token = await signToken()
      const response = await PATCH_ENTRY(
        makeRequest('PATCH', `http://localhost/api/ledger/entries/${entryId}`, {
          token,
          body: {},
        }),
        { params: Promise.resolve({ id: entryId }) }
      )
      expect(response.status).toBe(400)
    })
  })

  describe('DELETE /api/ledger/entries/:id', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await DELETE_ENTRY(
        makeRequest('DELETE', `http://localhost/api/ledger/entries/${entryId}`),
        {
          params: Promise.resolve({ id: entryId }),
        }
      )
      expect(response.status).toBe(401)
    })

    it('204s when owned', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerEntry.findFirst).mockResolvedValueOnce(
        makeEntry() as never
      )

      const response = await DELETE_ENTRY(
        makeRequest(
          'DELETE',
          `http://localhost/api/ledger/entries/${entryId}`,
          { token }
        ),
        { params: Promise.resolve({ id: entryId }) }
      )
      expect(response.status).toBe(204)
    })

    it("another user's entry → 404, delete never called", async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerEntry.findFirst).mockResolvedValueOnce(null)

      const response = await DELETE_ENTRY(
        makeRequest(
          'DELETE',
          `http://localhost/api/ledger/entries/${entryId}`,
          { token }
        ),
        { params: Promise.resolve({ id: entryId }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.ledgerEntry.delete).not.toHaveBeenCalled()
    })
  })

  // ─── The one explicit concurrency guard in this API ────────────────────────
  describe('POST /api/ledger/people/:id/settle', () => {
    it('401s when the Authorization header is missing', async () => {
      const response = await POST_SETTLE(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${personId}/settle`,
          { body: {} }
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(401)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('settles all active entries → 200 with settledCount/settledAmount/settledAt when no expectedBalance is sent', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(
        makePerson() as never
      ) // ownership
      vi.mocked(prisma.ledgerEntry.findMany).mockResolvedValueOnce([
        makeEntry({ amount: 500, type: 'GAVE' }),
        makeEntry({ id: 'e2', amount: 200, type: 'RECEIVED' }),
      ] as never)
      vi.mocked(prisma.ledgerEntry.updateMany).mockResolvedValueOnce({
        count: 2,
      } as never)
      mockZeroBalance([makePerson()])

      const response = await POST_SETTLE(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${personId}/settle`,
          { token, body: {} }
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.settledCount).toBe(2)
      expect(body.settledAmount).toBe(300) // |500 - 200|
      expect(body).toHaveProperty('settledAt')
      expect(
        vi.mocked(prisma.ledgerEntry.updateMany).mock.calls[0]?.[0]
      ).toMatchObject({
        data: { settled: true },
      })
    })

    it('zero active entries → 409 CONFLICT, updateMany never called', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(
        makePerson() as never
      )
      vi.mocked(prisma.ledgerEntry.findMany).mockResolvedValueOnce([] as never)

      const response = await POST_SETTLE(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${personId}/settle`,
          { token, body: {} }
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'CONFLICT',
        message: 'No outstanding entries to settle',
      })
      expect(prisma.ledgerEntry.updateMany).not.toHaveBeenCalled()
    })

    it('a stale expectedBalance → 409 CONFLICT, no rows settled (the optimistic-concurrency guard actually fires)', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(
        makePerson() as never
      )
      vi.mocked(prisma.ledgerEntry.findMany).mockResolvedValueOnce([
        makeEntry({ amount: 500, type: 'GAVE' }),
      ] as never)

      const response = await POST_SETTLE(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${personId}/settle`,
          {
            token,
            body: { expectedBalance: 100 },
          }
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(409)
      const body = await response.json()
      expect(body.error).toEqual({
        code: 'CONFLICT',
        message: 'This balance changed — reopen the dialog and try again',
      })
      expect(prisma.ledgerEntry.updateMany).not.toHaveBeenCalled()
    })

    it('a matching expectedBalance → 200, updateMany is called (the non-stale counterpart of the guard above)', async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(
        makePerson() as never
      )
      vi.mocked(prisma.ledgerEntry.findMany).mockResolvedValueOnce([
        makeEntry({ amount: 500, type: 'GAVE' }),
      ] as never)
      vi.mocked(prisma.ledgerEntry.updateMany).mockResolvedValueOnce({
        count: 1,
      } as never)
      mockZeroBalance([makePerson()])

      const response = await POST_SETTLE(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${personId}/settle`,
          {
            token,
            body: { expectedBalance: 500 },
          }
        ),
        { params: Promise.resolve({ id: personId }) }
      )
      expect(response.status).toBe(200)
      expect(prisma.ledgerEntry.updateMany).toHaveBeenCalled()
    })

    it("another user's person → 404, transaction never opened", async () => {
      const token = await signToken()
      vi.mocked(prisma.ledgerPerson.findFirst).mockResolvedValueOnce(null)

      const response = await POST_SETTLE(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${otherPersonId}/settle`,
          { token, body: {} }
        ),
        { params: Promise.resolve({ id: otherPersonId }) }
      )
      expect(response.status).toBe(404)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('400s (not 500) on malformed JSON', async () => {
      const token = await signToken()
      const request = new Request(
        `http://localhost/api/ledger/people/${personId}/settle`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: '{not json',
        }
      )
      const response = await POST_SETTLE(request, {
        params: Promise.resolve({ id: personId }),
      })
      expect(response.status).toBe(400)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('500s with the standardized envelope when the rate limiter itself throws, rather than crashing', async () => {
      vi.mocked(prisma.rateLimitBucket.upsert).mockRejectedValue(
        new Error('connection lost')
      )
      const token = await signToken()

      const response = await POST_SETTLE(
        makeRequest(
          'POST',
          `http://localhost/api/ledger/people/${personId}/settle`,
          { token, body: {} }
        ),
        { params: Promise.resolve({ id: personId }) }
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
