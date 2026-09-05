import 'server-only'
import { z } from 'zod'
import { AmountSchema } from '@/lib/server/common.schema'

const NameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(50, 'Name must be at most 50 characters')

const EmojiSchema = z
  .string()
  .trim()
  .min(1, 'Emoji is required')
  .max(10, 'Emoji must be at most 10 characters')

const ColourSchema = z
  .string()
  .regex(
    /^#[0-9a-fA-F]{6}$/,
    'Colour must be a valid hex colour (e.g. #6366f1)'
  )

const CategoryIdSchema = z.cuid('Invalid category ID')

export const BudgetTypeSchema = z.enum(
  ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'],
  {
    error: 'Type must be one of DAILY, WEEKLY, MONTHLY, YEARLY',
  }
)

const StartDateSchema = z.coerce
  .date({ error: 'startDate must be a valid ISO 8601 string' })
  .refine((d) => !Number.isNaN(d.getTime()), {
    message: 'startDate must be a valid ISO 8601 string',
  })

// ── Create body ───────────────────────────────────────────────────────────────
export const CreateBudgetBodySchema = z.object({
  name: NameSchema,
  emoji: EmojiSchema,
  colour: ColourSchema.optional().default('#6366f1'),
  type: BudgetTypeSchema,
  amount: AmountSchema,
  categoryId: CategoryIdSchema,
  startDate: StartDateSchema.optional(),
})

// ── Update body: partial, at least one field ──────────────────────────────────
export const UpdateBudgetBodySchema = z
  .object({
    name: NameSchema.optional(),
    emoji: EmojiSchema.optional(),
    colour: ColourSchema.optional(),
    type: BudgetTypeSchema.optional(),
    amount: AmountSchema.optional(),
    categoryId: CategoryIdSchema.optional(),
    startDate: StartDateSchema.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided'
  )

// ── Params ────────────────────────────────────────────────────────────────────
export const BudgetParamsSchema = z.object({
  id: z.cuid('Invalid budget ID'),
})

export type CreateBudgetBody = z.infer<typeof CreateBudgetBodySchema>
export type UpdateBudgetBody = z.infer<typeof UpdateBudgetBodySchema>
export type BudgetParams = z.infer<typeof BudgetParamsSchema>
export type BudgetPeriodType = z.infer<typeof BudgetTypeSchema>
