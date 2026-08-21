import { test, expect } from './fixtures'
import { loginViaUI } from './fixtures'
import { listCategories, createTx } from './helpers/api'

test.describe('Search & filters', () => {
  test('search filters list with a debounce', async ({ page, testUser, api }) => {
    const cats = await listCategories(api)
    await createTx(api, {
      amount: 10, date: new Date().toISOString(),
      note: 'Coffee', isIncome: false, categoryId: cats[0].id,
    })
    await createTx(api, {
      amount: 25, date: new Date().toISOString(),
      note: 'Pizza', isIncome: false, categoryId: cats[0].id,
    })

    await loginViaUI(page, testUser)
    await expect(page.getByText('Coffee')).toBeVisible()
    await expect(page.getByText('Pizza')).toBeVisible()

    const search = page.getByRole('searchbox', { name: /search transactions/i })
    await search.fill('piz')

    // Before debounce fires both are still visible; after, only Pizza remains.
    await expect(page.getByText('Pizza')).toBeVisible({ timeout: 2000 })
    await expect(page.getByText('Coffee')).not.toBeVisible()
  })

  test('income/expense toggle narrows the list', async ({ page, testUser, api }) => {
    const cats = await listCategories(api)
    const expenseCat = cats.find((c) => !c.isDefault === false && c.name === 'Food') ?? cats[0]
    const incomeCat = cats.find((c) => c.name === 'Salary')
    if (!incomeCat) throw new Error('Seeded "Salary" income category missing')

    await createTx(api, {
      amount: 40, date: new Date().toISOString(), note: 'Lunch',
      isIncome: false, categoryId: expenseCat.id,
    })
    await createTx(api, {
      amount: 5000, date: new Date().toISOString(), note: 'Paycheck',
      isIncome: true, categoryId: incomeCat.id,
    })

    await loginViaUI(page, testUser)
    await expect(page.getByText('Lunch')).toBeVisible()
    await expect(page.getByText('Paycheck')).toBeVisible()

    // Tap "Income"
    await page.getByRole('button', { name: /^income$/i }).first().click()

    await expect(page.getByText('Paycheck')).toBeVisible()
    await expect(page.getByText('Lunch')).not.toBeVisible()

    // Toggle off → both visible again
    await page.getByRole('button', { name: /^income$/i }).first().click()
    await expect(page.getByText('Lunch')).toBeVisible()
    await expect(page.getByText('Paycheck')).toBeVisible()
  })

  test('category chip filters by category; tapping again clears', async ({
    page,
    testUser,
    api,
  }) => {
    const cats = await listCategories(api)
    const food = cats.find((c) => c.name === 'Food')
    const transport = cats.find((c) => c.name === 'Transport')
    if (!food || !transport) throw new Error('default categories missing')

    await createTx(api, {
      amount: 30, date: new Date().toISOString(), note: 'Burger',
      isIncome: false, categoryId: food.id,
    })
    await createTx(api, {
      amount: 12, date: new Date().toISOString(), note: 'Bus fare',
      isIncome: false, categoryId: transport.id,
    })

    await loginViaUI(page, testUser)
    await expect(page.getByText('Burger')).toBeVisible()
    await expect(page.getByText('Bus fare')).toBeVisible()

    // The FilterBar renders a chip per category with its emoji + name.
    // Click the Food chip inside the filter bar.
    const foodChip = page
      .locator('button')
      .filter({ hasText: /^\s*🍔?\s*Food\s*$/i })
      .first()
    await foodChip.click()

    await expect(page.getByText('Burger')).toBeVisible()
    await expect(page.getByText('Bus fare')).not.toBeVisible()

    // Toggle off
    await foodChip.click()
    await expect(page.getByText('Bus fare')).toBeVisible()
  })

  test('empty state appears when a filter matches nothing', async ({
    page,
    testUser,
    api,
  }) => {
    const cats = await listCategories(api)
    await createTx(api, {
      amount: 99, date: new Date().toISOString(), note: 'Gym',
      isIncome: false, categoryId: cats[0].id,
    })

    await loginViaUI(page, testUser)
    const search = page.getByRole('searchbox', { name: /search transactions/i })
    await search.fill('nothing-matches-this-xyz')

    await expect(page.getByTestId('transaction-list-empty')).toBeVisible({
      timeout: 2000,
    })
  })
})
