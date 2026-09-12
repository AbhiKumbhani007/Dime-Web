import 'server-only'
import { z } from 'zod'
import { AmountSchema, cuidParam } from '@/lib/server/common.schema'

const NameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(50, 'Name must be at most 50 characters')

const PhoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9][0-9 ()-]{5,19}$/, 'Phone must be a valid phone number')

const NoteSchema = z
  .string()
  .trim()
  .max(500, 'Note must be at most 500 characters')

const ColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color (e.g. #6366f1)')

export const LedgerEntryTypeSchema = z.enum(['GAVE', 'RECEIVED'], {
  error: 'Type must be one of GAVE, RECEIVED',
})

// ── People ────────────────────────────────────────────────────────────────────
export const CreatePersonBodySchema = z.object({
  name: NameSchema,
  phone: PhoneSchema.optional(),
  note: NoteSchema.optional(),
  color: ColorSchema.optional().default('#6366f1'),
})

export const UpdatePersonBodySchema = z
  .object({
    name: NameSchema.optional(),
    phone: PhoneSchema.nullable().optional(),
    note: NoteSchema.nullable().optional(),
    color: ColorSchema.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided'
  )

export const PersonParamsSchema = cuidParam('id', 'person ID')

// ── Entries ───────────────────────────────────────────────────────────────────
const EntryDateSchema = z.coerce
  .date({ error: 'Date must be a valid ISO 8601 string' })
  .refine((d) => !Number.isNaN(d.getTime()), {
    message: 'Date must be a valid ISO 8601 string',
  })

export const CreateEntryBodySchema = z.object({
  amount: AmountSchema,
  type: LedgerEntryTypeSchema,
  date: EntryDateSchema,
  note: NoteSchema.optional(),
})

export const UpdateEntryBodySchema = z
  .object({
    amount: AmountSchema.optional(),
    type: LedgerEntryTypeSchema.optional(),
    date: EntryDateSchema.optional(),
    note: NoteSchema.nullable().optional(),
    settled: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided'
  )

export const EntryParamsSchema = cuidParam('id', 'entry ID')

// ── Settle ────────────────────────────────────────────────────────────────────
// Note: under the installed Zod v4 (`zod@4.3.6`), z.number()'s own base type
// check already rejects Infinity/NaN before `.finite()`'s custom message can
// surface — the custom string below is harmless but not what actually shows
// up in the 400 body. See tickets/F6.md's Decisions table and LEARNINGS.md.
export const SettleBodySchema = z
  .object({
    expectedBalance: z
      .number()
      .finite('expectedBalance must be a finite number')
      .optional(),
  })
  .optional()

export type CreatePersonBody = z.infer<typeof CreatePersonBodySchema>
export type UpdatePersonBody = z.infer<typeof UpdatePersonBodySchema>
export type PersonParams = z.infer<typeof PersonParamsSchema>
export type CreateEntryBody = z.infer<typeof CreateEntryBodySchema>
export type UpdateEntryBody = z.infer<typeof UpdateEntryBodySchema>
export type EntryParams = z.infer<typeof EntryParamsSchema>
export type SettleBody = z.infer<typeof SettleBodySchema>
