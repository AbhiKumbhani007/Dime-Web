import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { loginViaUI } from './fixtures'
import type { Result } from 'axe-core'

/**
 * Accessibility scans on the key pages.
 *
 * `KNOWN_VIOLATIONS` is the current tech-debt allowlist. New violations cause
 * the test to fail; known ones are reported in the test output but don't
 * block the suite. See process.txt [2026-04-19] "A11y backlog" for the plan
 * to close each item.
 *
 * Currently known (as of 2026-04-19):
 *   - meta-viewport         : user-scalable=no in app/layout.tsx (WCAG 1.4.4)
 *   - color-contrast        : --muted-foreground #7f8591 on #ffffff = 3.7:1
 *                             (--accent) #6366f1 on accent tint = 3.77:1
 */
const KNOWN_VIOLATIONS = new Set<string>([
  'meta-viewport',
  'color-contrast',
])

function partitionViolations(violations: Result[]) {
  const unexpected: Result[] = []
  const known: Result[] = []
  for (const v of violations) {
    if (KNOWN_VIOLATIONS.has(v.id)) known.push(v)
    else unexpected.push(v)
  }
  return { unexpected, known }
}

async function scan(page: import('@playwright/test').Page) {
  return await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
}

function assertNoNewViolations(violations: Result[]) {
  const { unexpected, known } = partitionViolations(violations)
  if (known.length) {
    // eslint-disable-next-line no-console
    console.info(
      `[a11y] ${known.length} known violation(s) (allowlisted): ${known.map((v) => v.id).join(', ')}`
    )
  }
  expect(
    unexpected,
    'New accessibility violations detected:\n' +
      JSON.stringify(unexpected, null, 2)
  ).toEqual([])
}

test.describe('Accessibility', () => {
  test('login page has no new WCAG violations', async ({ page }) => {
    await page.goto('/login')
    const results = await scan(page)
    assertNoNewViolations(results.violations)
  })

  test('signup page has no new WCAG violations', async ({ page }) => {
    await page.goto('/signup')
    const results = await scan(page)
    assertNoNewViolations(results.violations)
  })

  test('/log empty state has no new WCAG violations', async ({
    page,
    testUser,
  }) => {
    await loginViaUI(page, testUser)
    await expect(page.getByTestId('transaction-list-empty')).toBeVisible()
    const results = await scan(page)
    assertNoNewViolations(results.violations)
  })

  test('/log populated has no new WCAG violations', async ({
    page,
    testUser,
    api,
  }) => {
    const cats = await (await api.get('/api/categories')).json()
    await api.post('/api/transactions', {
      data: {
        amount: 25,
        date: new Date().toISOString(),
        note: 'A11y coffee',
        isIncome: false,
        categoryId: cats.categories[0].id,
      },
    })
    await loginViaUI(page, testUser)
    await expect(page.getByText('A11y coffee')).toBeVisible()
    const results = await scan(page)
    assertNoNewViolations(results.violations)
  })
})
