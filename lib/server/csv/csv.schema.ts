import 'server-only'
import { z } from 'zod'

const OptionalDate = z.coerce
  .date({ error: 'Date must be a valid ISO 8601 string' })
  .optional()

export const ExportQuerySchema = z.object({
  from: OptionalDate,
  to: OptionalDate,
})

export const CommitFieldsSchema = z.object({
  previewToken: z.string().min(1, 'previewToken is required'),
})

export type ExportQuery = z.infer<typeof ExportQuerySchema>
export type CommitFields = z.infer<typeof CommitFieldsSchema>
