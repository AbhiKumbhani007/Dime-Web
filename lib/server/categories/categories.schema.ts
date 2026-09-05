import 'server-only'
import { z } from 'zod'

export const CreateCategoryBodySchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(50, 'Name must be at most 50 characters'),
  emoji: z
    .string()
    .min(1, 'Emoji is required')
    .max(10, 'Emoji must be at most 10 characters'),
  color: z
    .string()
    .regex(
      /^#[0-9a-fA-F]{6}$/,
      'Color must be a valid hex color (e.g. #6366f1)'
    )
    .optional()
    .default('#6366f1'),
})

export const UpdateCategoryBodySchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name is required')
      .max(50, 'Name must be at most 50 characters')
      .optional(),
    emoji: z
      .string()
      .min(1, 'Emoji is required')
      .max(10, 'Emoji must be at most 10 characters')
      .optional(),
    color: z
      .string()
      .regex(
        /^#[0-9a-fA-F]{6}$/,
        'Color must be a valid hex color (e.g. #6366f1)'
      )
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided'
  )

export const CategoryParamsSchema = z.object({
  id: z.cuid('Invalid category ID'),
})

export type CreateCategoryBody = z.infer<typeof CreateCategoryBodySchema>
export type UpdateCategoryBody = z.infer<typeof UpdateCategoryBodySchema>
export type CategoryParams = z.infer<typeof CategoryParamsSchema>
