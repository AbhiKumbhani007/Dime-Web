import 'server-only'
import { z } from 'zod'

export const AnalyticsPeriodSchema = z.enum(['weekly', 'monthly', 'yearly'], {
  error: 'period must be one of weekly, monthly, yearly',
})

// Zod v4's ZodDate already rejects an uncoercible/NaN date at the base type
// check — the `error` override supplies our message for that, and the
// .refine is kept so an explicit NaN Date value is caught the same way (same
// pattern as transactions.schema.ts's DateSchema).
const DateQuerySchema = z.coerce
  .date({ error: 'Must be a valid ISO 8601 string' })
  .refine((d) => !Number.isNaN(d.getTime()), {
    message: 'Must be a valid ISO 8601 string',
  })

const CategoryIdSchema = z.cuid('Invalid category ID')

const BooleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))

export const OverviewQuerySchema = z.object({
  from: DateQuerySchema.optional(),
  to: DateQuerySchema.optional(),
})

export const ByPeriodQuerySchema = z.object({
  period: AnalyticsPeriodSchema,
  date: DateQuerySchema.optional(),
  categoryId: CategoryIdSchema.optional(),
})

export const ByCategoryQuerySchema = z.object({
  from: DateQuerySchema.optional(),
  to: DateQuerySchema.optional(),
  isIncome: BooleanQuerySchema.optional(),
})

export const TrendsQuerySchema = z.object({
  months: z.coerce
    .number()
    .int('months must be an integer')
    .positive('months must be a positive integer')
    .max(36, 'months must be at most 36')
    .optional()
    .default(6),
})

export const TopDaysQuerySchema = z.object({
  from: DateQuerySchema.optional(),
  to: DateQuerySchema.optional(),
  limit: z.coerce
    .number()
    .int('limit must be an integer')
    .positive('limit must be a positive integer')
    .max(100, 'limit must be at most 100')
    .optional()
    .default(10),
})

export type AnalyticsPeriod = z.infer<typeof AnalyticsPeriodSchema>
export type OverviewQuery = z.infer<typeof OverviewQuerySchema>
export type ByPeriodQuery = z.infer<typeof ByPeriodQuerySchema>
export type ByCategoryQuery = z.infer<typeof ByCategoryQuerySchema>
export type TrendsQuery = z.infer<typeof TrendsQuerySchema>
export type TopDaysQuery = z.infer<typeof TopDaysQuerySchema>
