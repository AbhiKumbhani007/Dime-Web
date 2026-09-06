import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from './templates.service'
import {
  CreateTemplateBodySchema,
  UpdateTemplateBodySchema,
  TemplateParamsSchema,
  SortQuerySchema,
  type CreateTemplateBody,
} from './templates.schema'

function createMockPrisma() {
  return {
    template: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
    },
  } as unknown as PrismaClient & {
    template: {
      findMany: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
    category: { findFirst: ReturnType<typeof vi.fn> }
  }
}

const uniqueConstraintError = Object.assign(
  new Error('Unique constraint failed'),
  { code: 'P2002' }
)

const templateInclude = {
  category: { select: { id: true, name: true, emoji: true, color: true } },
}

describe('listTemplates', () => {
  it('defaults to usage sort: most-used first, then most recently created', async () => {
    const prisma = createMockPrisma()
    prisma.template.findMany.mockResolvedValue([{ id: 'tpl1' }])

    const result = await listTemplates(prisma, 'user42', 'usage')

    expect(prisma.template.findMany).toHaveBeenCalledWith({
      where: { userId: 'user42' },
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
      include: templateInclude,
    })
    expect(result).toEqual([{ id: 'tpl1' }])
  })

  it('orders by lastUsedAt desc (nulls last), then createdAt desc for recent sort', async () => {
    const prisma = createMockPrisma()
    prisma.template.findMany.mockResolvedValue([])

    await listTemplates(prisma, 'user42', 'recent')

    expect(prisma.template.findMany).toHaveBeenCalledWith({
      where: { userId: 'user42' },
      orderBy: [
        { lastUsedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      include: templateInclude,
    })
  })

  it('orders alphabetically by label for label sort', async () => {
    const prisma = createMockPrisma()
    prisma.template.findMany.mockResolvedValue([])

    await listTemplates(prisma, 'user42', 'label')

    expect(prisma.template.findMany).toHaveBeenCalledWith({
      where: { userId: 'user42' },
      orderBy: [{ label: 'asc' }],
      include: templateInclude,
    })
  })
})

describe('createTemplate', () => {
  it('creates with all fields when categoryId is provided and owned', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: 'cat1',
      userId: 'user42',
    })
    prisma.template.create.mockResolvedValue({ id: 'tpl1', label: 'Coffee' })

    await createTemplate(prisma, 'user42', {
      label: 'Coffee',
      emoji: '☕',
      amount: 4.5,
      note: 'usual order',
      isIncome: false,
      categoryId: 'cat1',
    })

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'cat1', userId: 'user42' },
    })
    expect(prisma.template.create).toHaveBeenCalledWith({
      data: {
        label: 'Coffee',
        emoji: '☕',
        amount: 4.5,
        note: 'usual order',
        isIncome: false,
        categoryId: 'cat1',
        userId: 'user42',
      },
      include: templateInclude,
    })
  })

  it('creates without a category-ownership check when categoryId is omitted', async () => {
    const prisma = createMockPrisma()
    prisma.template.create.mockResolvedValue({ id: 'tpl1', label: 'Coffee' })

    await createTemplate(prisma, 'user42', {
      label: 'Coffee',
      emoji: '☕',
      isIncome: false,
    } as CreateTemplateBody)

    expect(prisma.category.findFirst).not.toHaveBeenCalled()
    expect(prisma.template.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: undefined }),
      })
    )
  })

  it('falls back to the default emoji and isIncome:false when the caller omits them (defensive — the schema normally fills these in before the service is called)', async () => {
    const prisma = createMockPrisma()
    prisma.template.create.mockResolvedValue({ id: 'tpl1', label: 'Coffee' })

    await createTemplate(prisma, 'user42', {
      label: 'Coffee',
    } as CreateTemplateBody)

    expect(prisma.template.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emoji: '🧾', isIncome: false }),
      })
    )
  })

  it('throws a 404 httpError and never calls create when categoryId does not resolve for this user', async () => {
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue(null)

    await expect(
      createTemplate(prisma, 'user42', {
        label: 'Coffee',
        categoryId: 'cat-foreign',
      } as CreateTemplateBody)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Category not found' })
    expect(prisma.template.create).not.toHaveBeenCalled()
  })

  it('throws a DUPLICATE_LABEL code on a unique-constraint violation', async () => {
    const prisma = createMockPrisma()
    prisma.template.create.mockRejectedValue(uniqueConstraintError)

    await expect(
      createTemplate(prisma, 'user42', {
        label: 'Coffee',
      } as CreateTemplateBody)
    ).rejects.toEqual({ code: 'DUPLICATE_LABEL' })
  })

  it('throws a 404 httpError (not a raw 500) when categoryId is deleted between the ownership check and the write', async () => {
    // The ownership check and the create aren't atomic — a concurrent
    // category delete lands here as a P2003 FK violation.
    const prisma = createMockPrisma()
    prisma.category.findFirst.mockResolvedValue({
      id: 'cat1',
      userId: 'user42',
    })
    prisma.template.create.mockRejectedValue(
      Object.assign(new Error('Foreign key constraint failed'), {
        code: 'P2003',
      })
    )

    await expect(
      createTemplate(prisma, 'user42', {
        label: 'Coffee',
        categoryId: 'cat1',
      } as CreateTemplateBody)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Category not found' })
  })

  it('rethrows non-P2002 errors unchanged', async () => {
    const prisma = createMockPrisma()
    const dbError = new Error('connection lost')
    prisma.template.create.mockRejectedValue(dbError)

    await expect(
      createTemplate(prisma, 'user42', {
        label: 'Coffee',
      } as CreateTemplateBody)
    ).rejects.toBe(dbError)
  })
})

describe('updateTemplate', () => {
  it('throws a 404 httpError and never checks category or calls update when not owned', async () => {
    const prisma = createMockPrisma()
    prisma.template.findFirst.mockResolvedValue(null)

    await expect(
      updateTemplate(prisma, 'user42', 'tpl1', { label: 'Latte' })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Template not found' })
    expect(prisma.category.findFirst).not.toHaveBeenCalled()
    expect(prisma.template.update).not.toHaveBeenCalled()
  })

  it('updates with the merged patch data when owned and no categoryId in the patch', async () => {
    const prisma = createMockPrisma()
    prisma.template.findFirst.mockResolvedValue({
      id: 'tpl1',
      userId: 'user42',
    })
    prisma.template.update.mockResolvedValue({ id: 'tpl1', label: 'Latte' })

    await updateTemplate(prisma, 'user42', 'tpl1', { label: 'Latte' })

    expect(prisma.template.findFirst).toHaveBeenCalledWith({
      where: { id: 'tpl1', userId: 'user42' },
    })
    expect(prisma.category.findFirst).not.toHaveBeenCalled()
    expect(prisma.template.update).toHaveBeenCalledWith({
      where: { id: 'tpl1' },
      data: { label: 'Latte' },
      include: templateInclude,
    })
  })

  it('throws a 404 and never calls update when the patched categoryId is not owned', async () => {
    const prisma = createMockPrisma()
    prisma.template.findFirst.mockResolvedValue({
      id: 'tpl1',
      userId: 'user42',
    })
    prisma.category.findFirst.mockResolvedValue(null)

    await expect(
      updateTemplate(prisma, 'user42', 'tpl1', { categoryId: 'cat-foreign' })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Category not found' })
    expect(prisma.template.update).not.toHaveBeenCalled()
  })

  it('clears categoryId via explicit null without a category-ownership check', async () => {
    const prisma = createMockPrisma()
    prisma.template.findFirst.mockResolvedValue({
      id: 'tpl1',
      userId: 'user42',
    })
    prisma.template.update.mockResolvedValue({ id: 'tpl1', categoryId: null })

    await updateTemplate(prisma, 'user42', 'tpl1', { categoryId: null })

    expect(prisma.category.findFirst).not.toHaveBeenCalled()
    expect(prisma.template.update).toHaveBeenCalledWith({
      where: { id: 'tpl1' },
      data: { categoryId: null },
      include: templateInclude,
    })
  })

  it('throws a DUPLICATE_LABEL code on a unique-constraint violation', async () => {
    const prisma = createMockPrisma()
    prisma.template.findFirst.mockResolvedValue({
      id: 'tpl1',
      userId: 'user42',
    })
    prisma.template.update.mockRejectedValue(uniqueConstraintError)

    await expect(
      updateTemplate(prisma, 'user42', 'tpl1', { label: 'Latte' })
    ).rejects.toEqual({ code: 'DUPLICATE_LABEL' })
  })

  it('throws a 404 httpError (not a raw 500) when categoryId is deleted between the ownership check and the write', async () => {
    const prisma = createMockPrisma()
    prisma.template.findFirst.mockResolvedValue({
      id: 'tpl1',
      userId: 'user42',
    })
    prisma.category.findFirst.mockResolvedValue({
      id: 'cat1',
      userId: 'user42',
    })
    prisma.template.update.mockRejectedValue(
      Object.assign(new Error('Foreign key constraint failed'), {
        code: 'P2003',
      })
    )

    await expect(
      updateTemplate(prisma, 'user42', 'tpl1', { categoryId: 'cat1' })
    ).rejects.toMatchObject({ statusCode: 404, message: 'Category not found' })
  })
})

describe('deleteTemplate', () => {
  it('throws a 404 httpError and never deletes when not owned', async () => {
    const prisma = createMockPrisma()
    prisma.template.findFirst.mockResolvedValue(null)

    await expect(
      deleteTemplate(prisma, 'user42', 'tpl1')
    ).rejects.toMatchObject({ statusCode: 404, message: 'Template not found' })
    expect(prisma.template.delete).not.toHaveBeenCalled()
  })

  it('deletes when owned', async () => {
    const prisma = createMockPrisma()
    prisma.template.findFirst.mockResolvedValue({
      id: 'tpl1',
      userId: 'user42',
    })

    await deleteTemplate(prisma, 'user42', 'tpl1')

    expect(prisma.template.delete).toHaveBeenCalledWith({
      where: { id: 'tpl1' },
    })
  })
})

describe('templates schemas', () => {
  it('rejects an empty patch body', () => {
    const result = UpdateTemplateBodySchema.safeParse({})
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'At least one field must be provided'
    )
  })

  it('accepts a patch with at least one field', () => {
    expect(UpdateTemplateBodySchema.safeParse({ label: 'Latte' }).success).toBe(
      true
    )
  })

  it('rejects a missing label on create (Zod v4 default type-error message, not the custom .min() one — see LEARNINGS.md)', () => {
    const result = CreateTemplateBodySchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects an empty-string label with the custom message', () => {
    const result = CreateTemplateBodySchema.safeParse({ label: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Label is required')
  })

  it('rejects a label over 50 characters', () => {
    const result = CreateTemplateBodySchema.safeParse({ label: 'x'.repeat(51) })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Label must be at most 50 characters'
    )
  })

  it('defaults emoji to 🧾 when omitted', () => {
    const result = CreateTemplateBodySchema.safeParse({ label: 'Coffee' })
    expect(result.success).toBe(true)
    expect(result.data?.emoji).toBe('🧾')
  })

  it('rejects an emoji over 10 characters', () => {
    const result = CreateTemplateBodySchema.safeParse({
      label: 'Coffee',
      emoji: 'x'.repeat(11),
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Emoji must be at most 10 characters'
    )
  })

  it('accepts amount: null on create (nullable) via the shared AmountSchema', () => {
    expect(
      CreateTemplateBodySchema.safeParse({ label: 'Coffee', amount: null })
        .success
    ).toBe(true)
  })

  it('rejects a non-positive amount via the shared AmountSchema', () => {
    const result = CreateTemplateBodySchema.safeParse({
      label: 'Coffee',
      amount: -5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a note over 500 characters', () => {
    const result = CreateTemplateBodySchema.safeParse({
      label: 'Coffee',
      note: 'x'.repeat(501),
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Note must be at most 500 characters'
    )
  })

  it('rejects note: null on create — only omission clears it, unlike update', () => {
    const result = CreateTemplateBodySchema.safeParse({
      label: 'Coffee',
      note: null,
    })
    expect(result.success).toBe(false)
  })

  it('accepts note: null on update, to clear it', () => {
    const result = UpdateTemplateBodySchema.safeParse({ note: null })
    expect(result.success).toBe(true)
  })

  it('rejects a non-cuid id in params', () => {
    const result = TemplateParamsSchema.safeParse({ id: 'not-a-cuid' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Invalid template ID')
  })

  it('defaults sort to usage when omitted', () => {
    const result = SortQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data?.sort).toBe('usage')
  })

  it('rejects an invalid sort value with the corrected custom message', () => {
    // This is the regression test for the {errorMap} vs {error} Zod v4 gap
    // (see the Decisions table in tickets/F4.md): a naive v3-style port would
    // fail this assertion by falling back to Zod's generic default message.
    const result = SortQuerySchema.safeParse({ sort: 'bogus' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'sort must be one of usage, recent, label'
    )
  })
})
