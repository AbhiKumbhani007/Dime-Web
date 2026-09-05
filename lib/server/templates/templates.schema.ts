import 'server-only'
import { z } from 'zod'
import { AmountSchema } from '@/lib/server/common.schema'

export const CreateTemplateBodySchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Label is required')
    .max(50, 'Label must be at most 50 characters'),
  emoji: z
    .string()
    .trim()
    .min(1, 'Emoji is required')
    .max(10, 'Emoji must be at most 10 characters')
    .optional()
    .default('🧾'),
  amount: AmountSchema.optional().nullable(),
  note: z
    .string()
    .trim()
    .max(500, 'Note must be at most 500 characters')
    .optional(),
  isIncome: z.boolean().optional().default(false),
  categoryId: z.cuid('Invalid category ID').optional(),
})

export const UpdateTemplateBodySchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, 'Label is required')
      .max(50, 'Label must be at most 50 characters')
      .optional(),
    emoji: z
      .string()
      .trim()
      .min(1, 'Emoji is required')
      .max(10, 'Emoji must be at most 10 characters')
      .optional(),
    amount: AmountSchema.nullable().optional(),
    note: z
      .string()
      .trim()
      .max(500, 'Note must be at most 500 characters')
      .nullable()
      .optional(),
    isIncome: z.boolean().optional(),
    categoryId: z.cuid('Invalid category ID').nullable().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided'
  )

export const TemplateParamsSchema = z.object({
  id: z.cuid('Invalid template ID'),
})

export const SortQuerySchema = z.object({
  sort: z
    .enum(['usage', 'recent', 'label'], {
      error: 'sort must be one of usage, recent, label',
    })
    .optional()
    .default('usage'),
})

export type CreateTemplateBody = z.infer<typeof CreateTemplateBodySchema>
export type UpdateTemplateBody = z.infer<typeof UpdateTemplateBodySchema>
export type TemplateParams = z.infer<typeof TemplateParamsSchema>
export type SortQuery = z.infer<typeof SortQuerySchema>
