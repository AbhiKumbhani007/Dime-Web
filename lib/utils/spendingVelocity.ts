import type { BudgetWithProgress } from '@/lib/api/budgets'

export interface Velocity {
  /**
   * Spend pace relative to time elapsed.
   *   1.0  — exactly on pace
   *   >1.0 — spending faster than the period is passing
   *   <1.0 — under pace
   */
  pace: number
  elapsedPercent: number
  projected: number
  status: 'over' | 'on-track' | 'under'
}

/**
 * pace = (spent / limit) / (elapsed / total period)
 *
 * Returns null when the period hasn't started or has no duration, since a
 * pace figure would be meaningless (or a divide-by-zero).
 */
export function spendingVelocity(
  budget: BudgetWithProgress,
  now: Date = new Date()
): Velocity | null {
  const start = new Date(budget.periodStart).getTime()
  const end = new Date(budget.periodEnd).getTime()
  const total = end - start

  if (!Number.isFinite(total) || total <= 0) return null
  if (budget.amount <= 0) return null

  const elapsed = Math.min(Math.max(now.getTime() - start, 0), total)
  const elapsedFraction = elapsed / total
  if (elapsedFraction <= 0) return null

  const spentFraction = budget.spent / budget.amount
  const pace = spentFraction / elapsedFraction

  return {
    pace: Math.round(pace * 100) / 100,
    elapsedPercent: Math.round(elapsedFraction * 100),
    projected: Math.round(budget.spent * (1 / elapsedFraction) * 100) / 100,
    // A 10% band around 1.0 counts as on track — without it almost every
    // budget reads as slightly over or under.
    status: pace > 1.1 ? 'over' : pace < 0.9 ? 'under' : 'on-track',
  }
}
