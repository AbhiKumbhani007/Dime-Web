import { test, expect } from './fixtures'
import { loginViaUI } from './fixtures'
import { createTx } from './helpers/api'
import type { APIRequestContext } from '@playwright/test'

async function foodCategoryId(api: APIRequestContext): Promise<string> {
  const res = await api.get('/api/categories')
  const cats = (await res.json()).categories as Array<{ id: string; name: string }>
  return cats.find((c) => c.name === 'Food')!.id
}

test.describe('Budgets', () => {
  test('empty state is shown before any budget exists', async ({ page, testUser }) => {
    await loginViaUI(page, testUser)

    await page.goto('/budgets')
    await expect(page.getByText('No budgets yet')).toBeVisible()
    await expect(page.getByTestId('budget-donut-summary')).toHaveCount(0)
  })

  test('creating a budget through the form adds a card to the grid', async ({
    page,
    testUser,
  }) => {
    await loginViaUI(page, testUser)
    await page.goto('/budgets')

    await page.getByRole('button', { name: 'Add budget' }).click()

    await page.getByLabel('Name').fill('Groceries')
    await page.getByLabel('Limit').fill('10000')
    await page.getByRole('radio', { name: 'Monthly' }).click()
    await page.getByRole('radio', { name: /Food/ }).click()
    await page.getByRole('button', { name: 'Save' }).click()

    const card = page.getByTestId('budget-card')
    await expect(card).toHaveCount(1)
    await expect(card.getByText('Groceries')).toBeVisible()
    await expect(page.getByTestId('budget-donut-summary')).toBeVisible()
  })

  test('spend reflects only expenses inside the active period', async ({
    page,
    testUser,
    api,
  }) => {
    const categoryId = await foodCategoryId(api)

    // In period: counts. Old expense and income: must not count.
    await createTx(api, {
      amount: 2500,
      date: new Date().toISOString(),
      isIncome: false,
      categoryId,
      note: 'in period',
    })
    await createTx(api, {
      amount: 900,
      date: '2020-01-15T12:00:00.000Z',
      isIncome: false,
      categoryId,
      note: 'long ago',
    })
    await createTx(api, {
      amount: 5000,
      date: new Date().toISOString(),
      isIncome: true,
      categoryId,
      note: 'income',
    })

    const created = await api.post('/api/budgets', {
      data: {
        name: 'Groceries',
        emoji: '🛒',
        type: 'MONTHLY',
        amount: 10000,
        categoryId,
      },
    })
    expect(created.status()).toBe(201)

    await loginViaUI(page, testUser)
    await page.goto('/budgets')

    const card = page.getByTestId('budget-card')
    await expect(card).toBeVisible()
    // ₹2,500.00 spent of ₹10,000.00 — not 3,400 and not 7,500.
    await expect(card.getByText(/2,500/)).toBeVisible()
    await expect(card.getByText(/10,000/)).toBeVisible()

    // 25% → green bar
    await expect(page.getByTestId('budget-progress-bar')).toHaveClass(/bg-green-500/)
  })

  test('an overspent budget shows a red bar and an over-by line', async ({
    page,
    testUser,
    api,
  }) => {
    const categoryId = await foodCategoryId(api)

    await createTx(api, {
      amount: 1500,
      date: new Date().toISOString(),
      isIncome: false,
      categoryId,
      note: 'overspend',
    })

    await api.post('/api/budgets', {
      data: {
        name: 'Tight budget',
        emoji: '🛒',
        type: 'MONTHLY',
        amount: 1000,
        categoryId,
      },
    })

    await loginViaUI(page, testUser)
    await page.goto('/budgets')

    await expect(page.getByTestId('budget-progress-bar')).toHaveClass(/bg-red-500/)
    await expect(page.getByText(/Over by/)).toBeVisible()
  })

  test('editing a budget updates the card', async ({ page, testUser, api }) => {
    const categoryId = await foodCategoryId(api)
    await api.post('/api/budgets', {
      data: { name: 'Groceries', emoji: '🛒', type: 'MONTHLY', amount: 10000, categoryId },
    })

    await loginViaUI(page, testUser)
    await page.goto('/budgets')

    await page.getByRole('button', { name: /Options for Groceries/ }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()

    await page.getByLabel('Name').fill('Groceries & household')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Groceries & household')).toBeVisible()
  })

  test('deleting a budget removes its card', async ({ page, testUser, api }) => {
    const categoryId = await foodCategoryId(api)
    await api.post('/api/budgets', {
      data: { name: 'Groceries', emoji: '🛒', type: 'MONTHLY', amount: 10000, categoryId },
    })

    await loginViaUI(page, testUser)
    await page.goto('/budgets')
    await expect(page.getByTestId('budget-card')).toHaveCount(1)

    await page.getByRole('button', { name: /Options for Groceries/ }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete' }).click()

    await expect(page.getByText('No budgets yet')).toBeVisible()
  })

  test('a DAILY budget only counts today', async ({ api }) => {
    const categoryId = await foodCategoryId(api)

    await createTx(api, {
      amount: 300,
      date: new Date().toISOString(),
      isIncome: false,
      categoryId,
      note: 'today',
    })
    // Two days ago — outside a DAILY window regardless of timezone.
    await createTx(api, {
      amount: 700,
      date: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      isIncome: false,
      categoryId,
      note: 'two days ago',
    })

    const created = await api.post('/api/budgets', {
      data: { name: 'Coffee', emoji: '☕', type: 'DAILY', amount: 1000, categoryId },
    })
    const budgetId = (await created.json()).budget.id

    const progress = await api.get(`/api/budgets/${budgetId}/progress`)
    const body = await progress.json()

    expect(body.spent).toBe(300)
    expect(body.remaining).toBe(700)
    expect(body.percent).toBe(30)
    expect(body.daysRemaining).toBe(1)
  })
})
