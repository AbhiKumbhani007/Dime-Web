import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkRateLimit, rateLimitKey } from './rateLimit'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    rateLimitBucket: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

describe('rateLimitKey', () => {
  it('composes the route-group and the first x-forwarded-for IP', () => {
    const request = new Request('http://localhost/api/csv/export', {
      headers: { 'x-forwarded-for': '203.0.113.4, 10.0.0.1' },
    })

    expect(rateLimitKey('csv-export', request)).toBe('csv-export:203.0.113.4')
  })

  it('falls back to "unknown" when x-forwarded-for is missing', () => {
    const request = new Request('http://localhost/api/csv/export')

    expect(rateLimitKey('csv-export', request)).toBe('csv-export:unknown')
  })
})

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows a request under the limit', async () => {
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 5,
    } as never)

    await expect(checkRateLimit('global:203.0.113.4', 100, 60)).resolves.toBe(
      true
    )
  })

  it('allows a request exactly at the limit', async () => {
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 100,
    } as never)

    await expect(checkRateLimit('global:203.0.113.4', 100, 60)).resolves.toBe(
      true
    )
  })

  it('blocks a request over the limit', async () => {
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 101,
    } as never)

    await expect(checkRateLimit('global:203.0.113.4', 100, 60)).resolves.toBe(
      false
    )
  })

  it('upserts on (key, windowStart) with an atomic increment, windowStart truncated to the window boundary', async () => {
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 1,
    } as never)
    const before = Date.now()

    await checkRateLimit('global:203.0.113.4', 100, 60)

    expect(prisma.rateLimitBucket.upsert).toHaveBeenCalledTimes(1)
    const call = vi.mocked(prisma.rateLimitBucket.upsert).mock.calls[0][0] as {
      where: { key_windowStart: { key: string; windowStart: Date } }
      create: { key: string; windowStart: Date; count: number }
      update: { count: { increment: number } }
    }

    expect(call.where.key_windowStart.key).toBe('global:203.0.113.4')
    expect(call.update).toEqual({ count: { increment: 1 } })
    expect(call.create).toEqual({
      key: 'global:203.0.113.4',
      windowStart: call.where.key_windowStart.windowStart,
      count: 1,
    })
    expect(call.where.key_windowStart.windowStart.getTime() % 60_000).toBe(0)
    expect(
      call.where.key_windowStart.windowStart.getTime()
    ).toBeLessThanOrEqual(before)
  })

  it('opportunistically deletes buckets older than 1 hour on each check', async () => {
    vi.mocked(prisma.rateLimitBucket.upsert).mockResolvedValue({
      count: 1,
    } as never)
    const before = Date.now()

    await checkRateLimit('global:203.0.113.4', 100, 60)

    expect(prisma.rateLimitBucket.deleteMany).toHaveBeenCalledTimes(1)
    const call = vi.mocked(prisma.rateLimitBucket.deleteMany).mock
      .calls[0][0] as {
      where: { windowStart: { lt: Date } }
    }
    const staleness = before - call.where.windowStart.lt.getTime()
    expect(staleness).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000)
    expect(staleness).toBeLessThanOrEqual(60 * 60 * 1000 + 1000)
  })
})
