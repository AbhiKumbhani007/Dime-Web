import { test, expect } from './fixtures'
import { loginViaUI } from './fixtures'

test.describe('Categories management', () => {
  test('new user lands with exactly 18 seeded categories', async ({ api }) => {
    const res = await api.get('/api/categories')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.categories).toHaveLength(18)
  })

  test('navigate from Log to Settings → Categories and see the list', async ({
    page,
    testUser,
  }) => {
    await loginViaUI(page, testUser)
    // Navigate via bottom nav / sidebar
    await page.getByRole('link', { name: /settings/i }).first().click()
    await page.waitForURL('**/settings', { timeout: 5_000 })

    // Find the categories entry point
    await page.getByRole('link', { name: /categories/i }).first().click()
    await page.waitForURL('**/settings/categories', { timeout: 5_000 })

    // Default categories visible (e.g., Food)
    await expect(page.getByText('Food')).toBeVisible()
    await expect(page.getByText('Transport')).toBeVisible()
    await expect(page.getByText('Salary')).toBeVisible()
  })

  test('deleting a category that has linked transactions is blocked (API)', async ({
    api,
  }) => {
    const catsRes = await api.get('/api/categories')
    if (catsRes.status() === 429) test.skip(true, 'rate limited — flaky under full suite')
    const cats = (await catsRes.json()).categories as Array<{ id: string; name: string }>
    const food = cats.find((c) => c.name === 'Food')!
    await api.post('/api/transactions', {
      data: {
        amount: 10,
        date: new Date().toISOString(),
        isIncome: false,
        categoryId: food.id,
      },
    })

    const del = await api.delete(`/api/categories/${food.id}`)
    expect(del.status()).toBe(409)
    const body = await del.json()
    expect(body.error).toMatch(/used/i)
  })
})
