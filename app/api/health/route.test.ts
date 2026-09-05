import { describe, it, expect } from 'vitest'
import { GET } from './route'

describe('GET /api/health', () => {
  it('returns 200 with status ok and an ISO timestamp', async () => {
    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp)
  })

  it('returns a fresh timestamp on every call', async () => {
    const first = await (await GET()).json()
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await (await GET()).json()

    expect(second.timestamp).not.toBe(first.timestamp)
  })
})
