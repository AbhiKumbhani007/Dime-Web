import 'server-only'
import { z } from 'zod'

// ── Amount: positive, ≤ 2 decimal places, ≤ 10^9 ──────────────────────────────
export const AmountSchema = z
  .number({ error: 'Amount must be a number' })
  .positive('Amount must be greater than 0')
  .max(1_000_000_000, 'Amount must be at most 1,000,000,000')
  .refine((n) => Number.isFinite(n), {
    message: 'Amount must be a finite number',
  })
  .refine(
    (n) => {
      // Reject more than 2 decimal places. Use a string check to avoid float rounding.
      const s = n.toString()
      const dot = s.indexOf('.')
      if (dot === -1) return true
      return s.length - dot - 1 <= 2
    },
    { message: 'Amount must have at most 2 decimal places' }
  )

// ── Reusable cuid route-param schema, e.g. cuidParam('personId', 'person ID') ─
export function cuidParam(paramName = 'id', label = 'ID') {
  return z.object({ [paramName]: z.string().cuid(`Invalid ${label}`) })
}
