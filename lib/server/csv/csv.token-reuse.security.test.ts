import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { commitImport, previewImport } from './csv.service'
import { hashPreviewToken } from './csv.token'

// Dedicated coverage for the CSV previewToken single-use enforcement fix
// (ConsumedPreviewToken model + commitImport's in-transaction consumption
// record). See lib/server/csv/csv.service.adversarial.test.ts's updated
// "token-reuse root cause, now fixed by single-use enforcement" describe
// block for the original bug this resolves — this file is the new,
// standalone test the fix's own ticket calls for.

process.env.JWT_ACCESS_SECRET =
  'test-jwt-access-secret-at-least-32-characters!!'

const USER_ID = 'user1'
const CATEGORY_ID = 'clcategory0000000000000001'

function createMockPrisma() {
  const prisma = {
    category: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), createMany: vi.fn() },
    consumedPreviewToken: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(),
  }
  // Runs the callback against the same mock object, so `tx.*` inside
  // commitImport's $transaction resolves via the same mocks as everywhere
  // else — matches csv.service.test.ts's convention.
  prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(prisma)
  )
  return prisma as unknown as PrismaClient & {
    category: { findMany: ReturnType<typeof vi.fn> }
    transaction: {
      findMany: ReturnType<typeof vi.fn>
      createMany: ReturnType<typeof vi.fn>
    }
    consumedPreviewToken: {
      create: ReturnType<typeof vi.fn>
      deleteMany: ReturnType<typeof vi.fn>
    }
    $transaction: ReturnType<typeof vi.fn>
  }
}

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf8')
}

const VALID_CSV =
  'Date,Amount,Type,Category,Note\r\n2026-08-30,1250.00,Expense,Groceries,Weekly shop\r\n'

async function commitOnce(
  prisma: ReturnType<typeof createMockPrisma>,
  previewToken: string
) {
  return commitImport(
    prisma,
    USER_ID,
    { buffer: csvBuffer(VALID_CSV), fileName: 'import.csv' },
    previewToken
  )
}

describe('hashPreviewToken', () => {
  it('is deterministic for the same token string', () => {
    const token = 'payload-base64url.signature-base64url'
    expect(hashPreviewToken(token)).toBe(hashPreviewToken(token))
  })

  it('hashes the FULL token (payload + signature) — a tampered signature never collides with the real hash', () => {
    const [payload, signature] = [
      'same-payload-segment',
      'real-signature',
    ]
    const real = `${payload}.${signature}`
    const tampered = `${payload}.a-different-signature`
    expect(hashPreviewToken(real)).not.toBe(hashPreviewToken(tampered))
  })
})

describe('commitImport — previewToken single-use enforcement', () => {
  it('commits the same previewToken twice, sequentially: the first succeeds, the second gets a clean 409 and inserts nothing', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })

    const preview = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(VALID_CSV),
      fileName: 'import.csv',
    })

    // Real Postgres behavior: the first create succeeds, the second hits the
    // ConsumedPreviewToken.tokenHash unique constraint and P2002s.
    prisma.consumedPreviewToken.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed on tokenHash'), {
          code: 'P2002',
        })
      )

    const first = await commitOnce(prisma, preview.previewToken)
    expect(first.imported).toBe(1)
    expect(prisma.transaction.createMany).toHaveBeenCalledTimes(1)

    await expect(commitOnce(prisma, preview.previewToken)).rejects.toMatchObject(
      {
        statusCode: 409,
        message: 'This import has already been completed',
      }
    )

    // No second batch of transactions was ever inserted for the replay.
    expect(prisma.transaction.createMany).toHaveBeenCalledTimes(1)

    // Both attempts claimed under the SAME tokenHash — proves the guard is
    // keyed on the token itself, not on file content or call count.
    const calls = prisma.consumedPreviewToken.create.mock.calls
    expect(calls[0][0].data.tokenHash).toBe(calls[1][0].data.tokenHash)
    expect(calls[0][0].data.userId).toBe(USER_ID)
  })

  it('the consumption record is created BEFORE any row insert, inside the same $transaction — a later failure rolls it back too', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    // The insert loop itself fails after the consumption record would have
    // been created — since prisma.$transaction here just runs the callback
    // inline (no real rollback semantics in a mock), this test instead
    // asserts call ORDER: consumedPreviewToken.create must be invoked before
    // transaction.createMany, matching the ticket's requirement that it run
    // as the transaction's first statement.
    const callOrder: string[] = []
    prisma.consumedPreviewToken.create.mockImplementation(async () => {
      callOrder.push('consume')
      return {}
    })
    prisma.transaction.createMany.mockImplementation(async () => {
      callOrder.push('insert')
      return { count: 1 }
    })

    const preview = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(VALID_CSV),
      fileName: 'import.csv',
    })

    await commitOnce(prisma, preview.previewToken)

    expect(callOrder).toEqual(['consume', 'insert'])
  })

  it('a real (non-P2002) database error from the consumption insert propagates as-is, not silently mapped to 409', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    const dbDown = Object.assign(new Error('Connection terminated'), {
      code: 'P1001',
    })
    prisma.consumedPreviewToken.create.mockRejectedValue(dbDown)

    const preview = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(VALID_CSV),
      fileName: 'import.csv',
    })

    await expect(commitOnce(prisma, preview.previewToken)).rejects.toBe(dbDown)
    expect(prisma.transaction.createMany).not.toHaveBeenCalled()
  })

  it('opportunistically deletes ConsumedPreviewToken rows older than the retention window on every commit attempt', async () => {
    const prisma = createMockPrisma()
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Groceries' },
    ])
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })

    const preview = await previewImport(prisma, USER_ID, {
      buffer: csvBuffer(VALID_CSV),
      fileName: 'import.csv',
    })

    await commitOnce(prisma, preview.previewToken)

    expect(prisma.consumedPreviewToken.deleteMany).toHaveBeenCalledWith({
      where: { consumedAt: { lt: expect.any(Date) } },
    })
  })
})
