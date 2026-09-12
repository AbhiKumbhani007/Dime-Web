// @vitest-environment node
//
// Adversarial, real-Postgres tests for lib/server/rateLimit.ts. Every other
// test of this module (rateLimit.test.ts) mocks Prisma — a mocked client
// can't prove the upsert-based increment is actually race-free, that the
// fixed window actually rolls over on the wall clock, or that opportunistic
// cleanup really deletes rows. These tests hit the real `dime_dev` Postgres
// database (shared with the dev server and every other worktree) directly,
// scoped to a run-unique key prefix so they can't collide with other agents'
// concurrent test runs against the same physical database, and clean up
// after themselves.
//
// dotenv is loaded via a dynamic import *before* '@/lib/server/prisma' is
// imported (also dynamically) so DATABASE_URL is set before the singleton
// PrismaClient is constructed — a plain top-level `import` would be hoisted
// and evaluated before this file's own statements run, which is too late.
import { describe, it, expect, afterAll, afterEach } from 'vitest'

const dotenv = await import('dotenv')
dotenv.config({ path: '.env.local' })

const { checkRateLimit, rateLimitKey } = await import('./rateLimit')
const { prisma } = await import('./prisma')

const RUN_ID = `rl-concurrency-${Date.now()}-${Math.random().toString(36).slice(2)}`

function testKey(suffix: string): string {
  return `${RUN_ID}:${suffix}`
}

afterAll(async () => {
  await prisma.rateLimitBucket.deleteMany({
    where: { key: { startsWith: RUN_ID } },
  })
  await prisma.$disconnect()
})

describe('checkRateLimit — real Postgres boundary correctness', () => {
  it('allows exactly RATE_LIMIT_MAX requests in a window and blocks the (RATE_LIMIT_MAX + 1)th', async () => {
    const key = testKey('boundary')
    const limit = 5

    for (let i = 1; i <= limit; i++) {
      await expect(
        checkRateLimit(key, limit, 60),
        `request #${i} of ${limit} should be allowed`
      ).resolves.toBe(true)
    }

    // One more, still inside the same window: must be blocked.
    await expect(checkRateLimit(key, limit, 60)).resolves.toBe(false)

    const bucket = await prisma.rateLimitBucket.findFirst({ where: { key } })
    expect(bucket?.count).toBe(limit + 1)
  })

  it('a request in the next window succeeds again — the fixed window actually resets', async () => {
    const key = testKey('window-reset')
    const limit = 2
    const windowSeconds = 1

    expect(await checkRateLimit(key, limit, windowSeconds)).toBe(true)
    expect(await checkRateLimit(key, limit, windowSeconds)).toBe(true)
    // Limit reached for this window.
    expect(await checkRateLimit(key, limit, windowSeconds)).toBe(false)

    // Cross the 1-second window boundary for real (not mocked/faked) — the
    // next call must land in a fresh window and be allowed again.
    await new Promise((resolve) =>
      setTimeout(resolve, windowSeconds * 1000 + 250)
    )

    expect(await checkRateLimit(key, limit, windowSeconds)).toBe(true)
  })

  it('an old bucket from a previous window never blocks a request keyed to the current window', async () => {
    // Deterministic complement to the real-wait test above: seed a stale
    // bucket sitting at (well past) the limit in a window that isn't the
    // current one, and confirm it has zero bearing on the current window's
    // count — buckets are windowed, not global per key.
    const key = testKey('stale-window-no-interference')
    const limit = 3
    const windowSeconds = 60
    const windowMs = windowSeconds * 1000
    const now = Date.now()
    const currentWindowStart = new Date(Math.floor(now / windowMs) * windowMs)
    const staleWindowStart = new Date(currentWindowStart.getTime() - windowMs)

    await prisma.rateLimitBucket.create({
      data: { key, windowStart: staleWindowStart, count: limit * 10 },
    })

    await expect(checkRateLimit(key, limit, windowSeconds)).resolves.toBe(true)

    const currentBucket = await prisma.rateLimitBucket.findUnique({
      where: { key_windowStart: { key, windowStart: currentWindowStart } },
    })
    expect(currentBucket?.count).toBe(1)
  })

  it('two different x-forwarded-for values get independent buckets, not a shared one', async () => {
    const routeGroup = testKey('xff-independence')
    const reqA = new Request('http://localhost/api/whatever', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    })
    const reqB = new Request('http://localhost/api/whatever', {
      headers: { 'x-forwarded-for': '203.0.113.20' },
    })
    const keyA = rateLimitKey(routeGroup, reqA)
    const keyB = rateLimitKey(routeGroup, reqB)
    expect(keyA).not.toBe(keyB)

    const limit = 3
    // Exhaust client A's bucket entirely.
    for (let i = 0; i < limit; i++) {
      expect(await checkRateLimit(keyA, limit, 60)).toBe(true)
    }
    expect(await checkRateLimit(keyA, limit, 60)).toBe(false)

    // Client B, interleaved on the very same route group, is unaffected —
    // it gets its own fresh allowance.
    for (let i = 0; i < limit; i++) {
      expect(await checkRateLimit(keyB, limit, 60)).toBe(true)
    }
    expect(await checkRateLimit(keyB, limit, 60)).toBe(false)
  })

  it("the csv-export route group's tighter cap fires independently of the global bucket — neither consumes the other", async () => {
    const ip = '198.51.100.42'
    const globalKey = rateLimitKey(
      testKey('csv-vs-global'),
      new Request('http://localhost/x', { headers: { 'x-forwarded-for': ip } })
    )
    const csvKey = rateLimitKey(
      testKey('csv-vs-global-csv-export'),
      new Request('http://localhost/x', { headers: { 'x-forwarded-for': ip } })
    )

    const globalLimit = 100
    const csvLimit = 3

    // Exhaust the small csv-export bucket for this client.
    for (let i = 0; i < csvLimit; i++) {
      expect(await checkRateLimit(csvKey, csvLimit, 60)).toBe(true)
    }
    expect(await checkRateLimit(csvKey, csvLimit, 60)).toBe(false)

    // The client is nowhere near the (much larger) global limit — global
    // route traffic for the same IP must still succeed.
    expect(await checkRateLimit(globalKey, globalLimit, 60)).toBe(true)

    // And conversely, hammering the global bucket must never count against
    // (or be blocked by) the already-exhausted csv-export bucket.
    for (let i = 0; i < 10; i++) {
      expect(await checkRateLimit(globalKey, globalLimit, 60)).toBe(true)
    }
    expect(await checkRateLimit(csvKey, csvLimit, 60)).toBe(false)

    const csvBucket = await prisma.rateLimitBucket.findFirst({
      where: { key: csvKey },
    })
    // Still exactly csvLimit+2 (the two extra checks above), never inflated
    // by the ten global-bucket hits.
    expect(csvBucket?.count).toBe(csvLimit + 2)
  })
})

describe('checkRateLimit — genuine concurrent-hit race (real overlapping DB calls)', () => {
  it('20 genuinely concurrent requests against a limit of 10 let through exactly 10, never more', async () => {
    const key = testKey('race-20-vs-10')
    const limit = 10
    const concurrency = 20

    // Promise.all fires all 20 calls before any of them has a chance to
    // await its own DB round trip — real overlapping network I/O against
    // the same (key, windowStart) row, not sequential mocked calls. If the
    // upsert-based increment had a lost-update race, more than `limit`
    // would come back true here.
    const results = await Promise.all(
      Array.from({ length: concurrency }, () => checkRateLimit(key, limit, 60))
    )

    const allowedCount = results.filter(Boolean).length
    expect(allowedCount).toBe(limit)

    const bucket = await prisma.rateLimitBucket.findFirst({ where: { key } })
    expect(bucket?.count).toBe(concurrency)
  })

  it('is race-free independently across two different concurrently-hammered keys', async () => {
    const keyA = testKey('race-multi-key-a')
    const keyB = testKey('race-multi-key-b')
    const limit = 5

    const [resultsA, resultsB] = await Promise.all([
      Promise.all(
        Array.from({ length: 15 }, () => checkRateLimit(keyA, limit, 60))
      ),
      Promise.all(
        Array.from({ length: 15 }, () => checkRateLimit(keyB, limit, 60))
      ),
    ])

    expect(resultsA.filter(Boolean).length).toBe(limit)
    expect(resultsB.filter(Boolean).length).toBe(limit)
  })
})

describe('checkRateLimit — opportunistic cleanup against a real table', () => {
  it('deletes rows older than 1 hour on a subsequent check', async () => {
    const staleKey = testKey('cleanup-stale')
    const staleWindowStart = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2h old

    await prisma.rateLimitBucket.create({
      data: { key: staleKey, windowStart: staleWindowStart, count: 42 },
    })

    const before = await prisma.rateLimitBucket.findUnique({
      where: {
        key_windowStart: { key: staleKey, windowStart: staleWindowStart },
      },
    })
    expect(before).not.toBeNull()

    // Any subsequent call runs the opportunistic cleanup, regardless of key.
    await checkRateLimit(testKey('cleanup-trigger'), 100, 60)

    const after = await prisma.rateLimitBucket.findUnique({
      where: {
        key_windowStart: { key: staleKey, windowStart: staleWindowStart },
      },
    })
    expect(after).toBeNull()
  })

  it('never deletes the active bucket for a window longer than 1 hour against real rows', async () => {
    const key = testKey('cleanup-long-window-safe')
    const windowSeconds = 25 * 60 * 60 // > 1h, e.g. a daily window

    expect(await checkRateLimit(key, 50, windowSeconds)).toBe(true)
    expect(await checkRateLimit(key, 50, windowSeconds)).toBe(true)

    const bucket = await prisma.rateLimitBucket.findFirst({ where: { key } })
    expect(bucket?.count).toBe(2)
  })

  afterEach(async () => {
    // Belt-and-braces: this describe block intentionally creates rows that
    // mimic already-old data, delete them even if an assertion above throws.
    await prisma.rateLimitBucket.deleteMany({
      where: { key: { startsWith: RUN_ID } },
    })
  })
})
