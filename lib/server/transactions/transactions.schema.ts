import 'server-only'
import { z } from 'zod'
import { AmountSchema } from '@/lib/server/common.schema'

// ── Date: ISO 8601 string, coerced to Date ────────────────────────────────────
// Zod v4's ZodDate already rejects an uncoercible/NaN date at the base type
// check (unlike v3, which this port's source relies on the .refine for) —
// the `error` override supplies our message for that base check, and the
// .refine is kept so an explicit NaN Date value is caught the same way.
const DateSchema = z.coerce
  .date({ error: 'Date must be a valid ISO 8601 string' })
  .refine((d) => !Number.isNaN(d.getTime()), {
    message: 'Date must be a valid ISO 8601 string',
  })

// ── Note: optional string, max 500 chars, trimmed ─────────────────────────────
const NoteSchema = z
  .string()
  .trim()
  .max(500, 'Note must be at most 500 characters')
  .optional()

// ── categoryId: cuid ──────────────────────────────────────────────────────────
const CategoryIdSchema = z.cuid('Invalid category ID')

// ── templateId: cuid, write-time signal only — never persisted on Transaction ──
const TemplateIdSchema = z.cuid('Invalid template ID')

// ── Create body ───────────────────────────────────────────────────────────────
export const CreateTransactionBodySchema = z.object({
  amount: AmountSchema,
  date: DateSchema,
  note: NoteSchema,
  isIncome: z.boolean({ error: 'isIncome must be a boolean' }),
  categoryId: CategoryIdSchema,
  templateId: TemplateIdSchema.optional(),
})

// ── Update body: partial, at least one field ──────────────────────────────────
export const UpdateTransactionBodySchema = z
  .object({
    amount: AmountSchema.optional(),
    date: DateSchema.optional(),
    note: NoteSchema,
    isIncome: z.boolean().optional(),
    categoryId: CategoryIdSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

// ── Params ────────────────────────────────────────────────────────────────────
export const TransactionParamsSchema = z.object({
  id: z.cuid('Invalid transaction ID'),
})

// ── List query ────────────────────────────────────────────────────────────────
export const ListTransactionsQuerySchema = z.object({
  cursor: z.cuid('Invalid cursor').optional(),
  limit: z.coerce
    .number()
    .int('Limit must be an integer')
    .positive('Limit must be a positive integer')
    .max(100, 'Limit must be at most 100')
    .optional()
    .default(20),
  search: z.string().trim().min(1).max(200).optional(),
  categoryId: CategoryIdSchema.optional(),
  isIncome: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

export type CreateTransactionBody = z.infer<typeof CreateTransactionBodySchema>
export type UpdateTransactionBody = z.infer<typeof UpdateTransactionBodySchema>
export type TransactionParams = z.infer<typeof TransactionParamsSchema>
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>
