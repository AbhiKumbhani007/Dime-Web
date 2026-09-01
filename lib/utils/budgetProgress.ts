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

/**
 * Bar fills use --warning-fill for the amber band; text uses --warning, which
 * is a step darker so it clears 4.5:1 on --card in the light theme.
 */
export const HEALTH_BAR_CLASS: Record<BudgetHealth, string> = {
  safe: 'bg-income',
  warning: 'bg-warning-fill',
  danger: 'bg-expense',
}

export const HEALTH_TEXT_CLASS: Record<BudgetHealth, string> = {
  safe: 'text-income',
  warning: 'text-warning',
  danger: 'text-expense',
}

/** Bar width, clamped to 0–100 even when the budget is overspent. */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) return 0
  return Math.min(percent, 100)
}
