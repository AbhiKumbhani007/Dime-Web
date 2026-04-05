const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Format a number as ₹1,23,456.78 */
export function formatINR(amount: number): string {
  return formatter.format(amount)
}

/** Format a large number compactly: ₹1.2L, ₹45K etc. */
export function formatINRCompact(amount: number): string {
  return compactFormatter.format(amount)
}

/** Parse a string like "1,234.56" or "₹1,234.56" to a number */
export function parseAmount(value: string): number {
  const cleaned = value.replace(/[₹,\s]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}
