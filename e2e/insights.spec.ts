import { test, expect } from './fixtures'
import { loginViaUI } from './fixtures'
import { createTx } from './helpers/api'
import type { APIRequestContext } from '@playwright/test'

async function categoryId(api: APIRequestContext, name: string): Promise<string> {
  const res = await api.get('/api/categories')
  const cats = (await res.json()).categories as Array<{ id: string; name: string }>
  return cats.find((c) => c.name === name)!.id
}

/** Seed a known month: 750 Food + 250 Transport expense, 50000 Salary income. */
async function seedThisMonth(api: APIRequestContext) {
  const today = new Date().toISOString()
  await createTx(api, {
    amount: 750,
    date: today,
    isIncome: false,
    categoryId: await categoryId(api, 'Food'),
    note: 'food',
  })
  await createTx(api, {
    amount: 250,
    date: today,
    isIncome: false,
    categoryId: await categoryId(api, 'Transport'),
    note: 'bus',
  })
  await createTx(api, {
    amount: 50000,
    date: today,
    isIncome: true,
    categoryId: await categoryId(api, 'Salary'),
    note: 'salary',
  })
}

test.describe('Insights', () => {
  test('the page does not scroll horizontally on a phone viewport', async ({
    page,
    testUser,
    api,
  }) => {
    // The category chip row is wider than the screen; it must scroll inside its
    // own container rather than stretching the page.
    await seedThisMonth(api)
    await loginViaUI(page, testUser)
    await page.goto('/insights')
    await page.getByTestId('overview-card').waitFor()

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

    // The tab row must be fully visible, not clipped at the right edge.
    const yearly = page.getByRole('tab', { name: 'Yearly' })
    const box = (await yearly.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(clientWidth)
  })

  test('overview totals reflect the seeded month', async ({ page, testUser, api }) => {
    await seedThisMonth(api)
    await loginViaUI(page, testUser)
    await page.goto('/insights')

    const card = page.getByTestId('overview-card')
    await expect(card).toBeVisible()
    await expect(card.getByText(/50,000/)).toBeVisible()
    await expect(card.getByText(/1,000/).first()).toBeVisible()
    await expect(page.getByTestId('net-balance')).toContainText('49,000')
  })

  test('category donut shows each category with percentages summing to 100', async ({
    page,
    testUser,
    api,
  }) => {
    await seedThisMonth(api)
    await loginViaUI(page, testUser)
    await page.goto('/insights')

    const donut = page.getByTestId('category-donut')
    await expect(donut).toBeVisible()
    await expect(donut.getByText(/Food/)).toBeVisible()
    await expect(donut.getByText('75%')).toBeVisible()
    await expect(donut.getByText('25%')).toBeVisible()
  })

  test('income toggle switches the donut to income categories', async ({
    page,
    testUser,
    api,
  }) => {
    await seedThisMonth(api)
    await loginViaUI(page, testUser)
    await page.goto('/insights')

    // exact: the 'Rental Income' category chip is also a radio named /Income/.
    await page.getByRole('radio', { name: 'Income', exact: true }).click()

    const donut = page.getByTestId('category-donut')
    await expect(donut.getByText(/Salary/)).toBeVisible()
    await expect(donut.getByText('100%')).toBeVisible()
  })

  test('period tabs switch the chart and the label', async ({ page, testUser, api }) => {
    await seedThisMonth(api)
    await loginViaUI(page, testUser)
    await page.goto('/insights')

    // Monthly is the default.
    await expect(page.getByRole('tab', { name: 'Monthly' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    const monthlyLabel = await page.getByTestId('period-label').textContent()

    await page.getByRole('tab', { name: 'Yearly' }).click()
    await expect(page.getByRole('tab', { name: 'Yearly' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(page.getByTestId('period-label')).not.toHaveText(monthlyLabel ?? '')

    // A year label is just the 4-digit year.
    await expect(page.getByTestId('period-label')).toHaveText(/^\d{4}$/)
  })

  test('the next arrow is disabled on the current period and enabled after stepping back', async ({
    page,
    testUser,
  }) => {
    await loginViaUI(page, testUser)
    await page.goto('/insights')

    await expect(page.getByRole('button', { name: 'Next period' })).toBeDisabled()

    await page.getByRole('button', { name: 'Previous period' }).click()
    await expect(page.getByRole('button', { name: 'Next period' })).toBeEnabled()
  })

  test('stepping to the previous period shows an empty breakdown', async ({
    page,
    testUser,
    api,
  }) => {
    await seedThisMonth(api)
    await loginViaUI(page, testUser)
    await page.goto('/insights')

    await expect(page.getByTestId('category-donut')).toBeVisible()

    // Last month has no data seeded.
    await page.getByRole('button', { name: 'Previous period' }).click()
    await expect(page.getByTestId('category-donut-empty')).toBeVisible()
  })

  test('advanced sections start collapsed and expand independently', async ({
    page,
    testUser,
    api,
  }) => {
    await seedThisMonth(api)
    await loginViaUI(page, testUser)
    await page.goto('/insights')

    const trends = page.getByRole('button', { name: /Trends/ })
    await expect(trends).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('trends-chart')).toHaveCount(0)

    await trends.click()
    await expect(trends).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('trends-chart')).toBeVisible()

    // Net cashflow stayed shut.
    await expect(page.getByRole('button', { name: /Net cashflow/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  test('top spending days lists the seeded day', async ({ page, testUser, api }) => {
    await seedThisMonth(api)
    await loginViaUI(page, testUser)
    await page.goto('/insights')

    await page.getByRole('button', { name: /Top spending days/ }).click()

    const list = page.getByTestId('top-days-list')
    await expect(list).toBeVisible()
    // 750 + 250 on the same day
    await expect(list.getByText(/1,000/)).toBeVisible()
  })

  test('budget vs actual reflects an existing budget', async ({ page, testUser, api }) => {
    await seedThisMonth(api)
    await api.post('/api/budgets', {
      data: {
        name: 'Groceries',
        emoji: '🛒',
        type: 'MONTHLY',
        amount: 5000,
        categoryId: await categoryId(api, 'Food'),
      },
    })

    await loginViaUI(page, testUser)
    await page.goto('/insights')

    await page.getByRole('button', { name: /Budget vs actual/ }).click()
    await expect(page.getByTestId('budget-vs-actual-chart')).toBeVisible()
  })

  test('spending velocity reports pace against a budget', async ({
    page,
    testUser,
    api,
  }) => {
    await seedThisMonth(api)
    await api.post('/api/budgets', {
      data: {
        name: 'Groceries',
        emoji: '🛒',
        type: 'MONTHLY',
        amount: 5000,
        categoryId: await categoryId(api, 'Food'),
      },
    })

    await loginViaUI(page, testUser)
    await page.goto('/insights')

    await page.getByRole('button', { name: /Spending velocity/ }).click()
    const velocity = page.getByTestId('spending-velocity')
    await expect(velocity).toBeVisible()
    await expect(velocity.getByText(/of period elapsed/)).toBeVisible()
  })
})
