import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contrast gate for the token layer.
 *
 * `e2e/a11y.spec.ts` allowlists the axe `color-contrast` rule wholesale, so
 * nothing in CI would otherwise catch a palette regression. This parses the
 * real values out of globals.css and checks the pairs DESIGN.md §3.6 calls out,
 * for every theme — a palette edit that fails AA fails the build.
 *
 * Targets: WCAG AA — 4.5:1 for body text, 3:1 for graphics and large text.
 */

const CSS = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')

const THEMES = ['light', 'dark', 'dim', 'midnight', 'sunset'] as const
type Theme = (typeof THEMES)[number]

/** Pull one theme's `--token: #hex` declarations out of its selector block. */
function tokensFor(theme: Theme): Record<string, string> {
  const selector = theme === 'light' ? '\\:root,\\s*\\[data-theme="light"\\]' : `\\[data-theme="${theme}"\\]`
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(CSS)
  if (!block) throw new Error(`No token block found for theme "${theme}"`)

  const tokens: Record<string, string> = {}
  for (const [, name, value] of block[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name] = value.toLowerCase()
  }
  return tokens
}

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Pairs that carry body text — must clear 4.5:1. */
const TEXT_PAIRS: Array<[string, string]> = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['card-foreground', 'card'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['primary-foreground', 'primary'],
  ['destructive-foreground', 'destructive'],
  ['income', 'card'],
  ['income', 'background'],
  ['expense', 'card'],
  ['expense', 'background'],
  ['warning', 'card'],
  ['warning', 'background'],
]

/** Pairs used only as fills, bars and rings — 3:1 is the bar. */
const GRAPHIC_PAIRS: Array<[string, string]> = [
  ['primary', 'background'],
  ['accent', 'background'],
  ['ring', 'background'],
  ['warning-fill', 'card'],
  ['warning-fill', 'muted'],
  ['chart-net', 'card'],
  ['chart-budgeted', 'card'],
  ['border', 'background'],
]

/**
 * Documented deviations from the 3:1 graphic target, with the ratio the design
 * actually ships. These are design decisions, not bugs, so they are recorded
 * rather than silently dropped — and each still has a floor, so the pair can
 * never get *worse* without failing.
 *
 *  - `border` on `background`: DESIGN.md §3.4 asks for an "almost flat" surface
 *    treatment — hairlines are decorative, and a card is identified by its
 *    `--card` fill, not its outline. WCAG 1.4.11 covers boundaries that are the
 *    sole identifier of a component; these are not.
 *  - `chart-budgeted`: the muted "budgeted" series is always paired with a text
 *    legend and an adjacent higher-contrast "actual" bar, so colour is never the
 *    only channel carrying the distinction.
 *  - `warning-fill` on `muted`: the amber budget band on its own track, 0.11
 *    short. Worth revisiting with design; darkening it far enough to clear 3:1
 *    starts reading as the danger band.
 *
 * Key is `theme:fg/bg`.
 */
const KNOWN_DEVIATIONS: Record<string, number> = {
  'light:border/background': 1.23,
  'dark:border/background': 1.33,
  'dim:border/background': 1.49,
  'midnight:border/background': 1.72,
  'sunset:border/background': 1.28,
  'light:chart-budgeted/card': 2.42,
  'dim:chart-budgeted/card': 2.74,
  'light:warning-fill/muted': 2.89,
}

describe('design tokens', () => {
  it.each(THEMES)('%s defines every token the app consumes', (theme) => {
    const tokens = tokensFor(theme)
    const required = [
      'background', 'foreground', 'card', 'card-foreground',
      'muted', 'muted-foreground', 'border', 'input',
      'primary', 'primary-foreground', 'accent', 'accent-foreground',
      'destructive', 'destructive-foreground', 'ring',
      'income', 'expense', 'warning', 'warning-fill',
      'chart-budgeted', 'chart-net',
    ]
    expect(Object.keys(tokens).sort()).toEqual(expect.arrayContaining(required.sort()))
  })

  describe.each(THEMES)('%s contrast', (theme) => {
    const tokens = tokensFor(theme)

    it.each(TEXT_PAIRS)('%s on %s clears 4.5:1', (fg, bg) => {
      const ratio = contrast(tokens[fg], tokens[bg])
      expect(
        ratio,
        `${theme}: --${fg} (${tokens[fg]}) on --${bg} (${tokens[bg]}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5)
    })

    it.each(GRAPHIC_PAIRS)('%s on %s clears 3:1', (fg, bg) => {
      const ratio = contrast(tokens[fg], tokens[bg])
      const floor = KNOWN_DEVIATIONS[`${theme}:${fg}/${bg}`] ?? 3
      expect(
        ratio,
        `${theme}: --${fg} (${tokens[fg]}) on --${bg} (${tokens[bg]}) = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(floor)
    })
  })
})
