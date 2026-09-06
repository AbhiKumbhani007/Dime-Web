import 'server-only'
import type { Prisma, PrismaClient } from '@prisma/client'
import type {
  CreateTemplateBody,
  UpdateTemplateBody,
  SortQuery,
} from './templates.schema'
import { httpError } from '@/lib/server/httpError'

const templateInclude = {
  category: { select: { id: true, name: true, emoji: true, color: true } },
} as const

export type TemplateWithCategory = Prisma.TemplateGetPayload<{
  include: typeof templateInclude
}>

// 'usage'/'recent' sort on usageCount/lastUsedAt, which nothing in this
// module writes — the bump lives in transactions.service.ts (Feature 2) as a
// write-time side effect of creating a transaction with a templateId. Until
// that lands, both sorts degrade to createdAt order; this is expected, not a
// bug (see tickets/F4.md's Decisions table).
function orderByFor(sort: SortQuery['sort']) {
  switch (sort) {
    case 'recent':
      return [
        { lastUsedAt: { sort: 'desc' as const, nulls: 'last' as const } },
        { createdAt: 'desc' as const },
      ]
    case 'label':
      return [{ label: 'asc' as const }]
    case 'usage':
    default:
      return [{ usageCount: 'desc' as const }, { createdAt: 'desc' as const }]
  }
}

async function assertCategoryOwned(
  prisma: PrismaClient,
  userId: string,
  categoryId: string
): Promise<void> {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  })
  if (!category) {
    throw httpError(404, 'Category not found')
  }
}

export async function listTemplates(
  prisma: PrismaClient,
  userId: string,
  sort: SortQuery['sort']
): Promise<TemplateWithCategory[]> {
  return prisma.template.findMany({
    where: { userId },
    orderBy: orderByFor(sort),
    include: templateInclude,
  })
}

export async function createTemplate(
  prisma: PrismaClient,
  userId: string,
  data: CreateTemplateBody
): Promise<TemplateWithCategory> {
  if (data.categoryId) {
    await assertCategoryOwned(prisma, userId, data.categoryId)
  }

  try {
    return await prisma.template.create({
      data: {
        label: data.label,
        emoji: data.emoji ?? '🧾',
        amount: data.amount,
        note: data.note,
        isIncome: data.isIncome ?? false,
        categoryId: data.categoryId,
        userId,
      },
      include: templateInclude,
    })
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2002') {
      throw { code: 'DUPLICATE_LABEL' }
    }
    // The category-ownership check above isn't atomic with this write — a
    // concurrent delete of that category lands here as a P2003 FK violation
    // rather than the 404 the check above would normally have caught.
    if (e.code === 'P2003') {
      throw httpError(404, 'Category not found')
    }
    throw err
  }
}

export async function updateTemplate(
  prisma: PrismaClient,
  userId: string,
  id: string,
  data: UpdateTemplateBody
): Promise<TemplateWithCategory> {
  const existing = await prisma.template.findFirst({ where: { id, userId } })
  if (!existing) {
    throw httpError(404, 'Template not found')
  }

  // categoryId is nullable on this model (clearing is always allowed via an
  // explicit null); only a truthy categoryId needs an ownership check.
  if (data.categoryId) {
    await assertCategoryOwned(prisma, userId, data.categoryId)
  }

  try {
    return await prisma.template.update({
      where: { id },
      data,
      include: templateInclude,
    })
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2002') {
      throw { code: 'DUPLICATE_LABEL' }
    }
    // See createTemplate's identical comment — the ownership check above
    // isn't atomic with this write.
    if (e.code === 'P2003') {
      throw httpError(404, 'Category not found')
    }
    throw err
  }
}

export async function deleteTemplate(
  prisma: PrismaClient,
  userId: string,
  id: string
): Promise<void> {
  const existing = await prisma.template.findFirst({ where: { id, userId } })
  if (!existing) {
    throw httpError(404, 'Template not found')
  }

  await prisma.template.delete({ where: { id } })
}
