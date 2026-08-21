/**
 * Health bands for a budget's progress bar.
 *   < 75%   safe
 *   75–90%  warning
 *   > 90%   danger
 * Boundaries are inclusive at 75 and 90 per the F07 spec: exactly 75% is a
 * warning, exactly 90% is still a warning, and anything above 90% is danger.
 */
export type BudgetHealth = 'safe' | 'warning' | 'danger'

export function budgetHealth(percent: number): BudgetHealth {
  if (percent > 90) return 'danger'
  if (percent >= 75) return 'warning'
  return 'safe'
}

export const HEALTH_BAR_CLASS: Record<BudgetHealth, string> = {
  safe: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
}

export const HEALTH_TEXT_CLASS: Record<BudgetHealth, string> = {
  safe: 'text-green-600 dark:text-green-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
}

/** Bar width, clamped to 0–100 even when the budget is overspent. */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) return 0
  return Math.min(percent, 100)
}
