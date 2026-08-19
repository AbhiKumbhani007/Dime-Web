import { test, expect } from './fixtures'
import { loginViaUI } from './fixtures'

test.describe('Smoke — golden path', () => {
  test('signup → log → add transaction → see it in the list', async ({
    page,
    testUser,
  }) => {
    // testUser is already registered via API; we just need to sign in through UI
    await loginViaUI(page, testUser)

    // Start on /log — empty state shown because new user has no transactions
    await expect(page.getByTestId('transaction-list-empty')).toBeVisible()
    await expect(page.getByText(/no transactions/i)).toBeVisible()

    // Open the add form
    await page.getByRole('button', { name: /add transaction/i }).click()
    await expect(page.getByRole('heading', { name: /new transaction/i })).toBeVisible()

    // Fill the form: Expense (default), amount 99.50, note "Coffee"
    await page.getByPlaceholder('0.00').fill('99.50')
    await page.getByPlaceholder('Optional note').fill('Coffee')

    // Category: default is pre-selected to first available; skip picker

    // Save
    await page.getByRole('button', { name: /^save$/i }).click()

    // Sheet closes + the new row appears in the list
    await expect(page.getByRole('heading', { name: /new transaction/i })).not.toBeVisible()
    await expect(page.getByText('Coffee')).toBeVisible()
    await expect(page.getByText(/99\.50/)).toBeVisible()
  })
})
