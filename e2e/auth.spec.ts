import { test, expect } from './fixtures'
import { loginViaUI } from './fixtures'

test.describe('Auth flows', () => {
  test('signup creates account and redirects to /log', async ({ page, request }) => {
    const ts = Date.now()
    const email = `signup-${ts}@dime.test`
    const password = 'Password123!'

    await page.goto('/signup')
    await page.locator('#name').fill('Jane E2E')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.locator('#confirmPassword').fill(password)
    await page.getByRole('button', { name: /create account/i }).click()

    await page.waitForURL('**/log', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/log$/)

    // Verify user exists on the backend
    const res = await request.post('http://localhost:4000/api/auth/login', {
      data: { email, password },
    })
    expect(res.ok()).toBe(true)
  })

  test('login with wrong password shows inline error, no redirect', async ({
    page,
    testUser,
  }) => {
    await page.goto('/login')
    await page.locator('#email').fill(testUser.email)
    await page.locator('#password').fill('wrongpassword!!')
    await page.getByRole('button', { name: /^sign in$/i }).click()

    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('unauthenticated visit to /log redirects to /login', async ({ page }) => {
    await page.goto('/log')
    await page.waitForURL('**/login', { timeout: 10_000 })
  })

  test('signup password mismatch shows validation error', async ({ page }) => {
    await page.goto('/signup')
    const ts = Date.now()
    await page.locator('#email').fill(`mm-${ts}@dime.test`)
    await page.locator('#password').fill('Password123!')
    await page.locator('#confirmPassword').fill('DifferentPass1!')
    await page.getByRole('button', { name: /create account/i }).click()

    await expect(page.getByText(/passwords do not match/i)).toBeVisible()
    await expect(page).toHaveURL(/\/signup$/)
  })

  test('signup weak password shows validation error', async ({ page }) => {
    await page.goto('/signup')
    const ts = Date.now()
    await page.locator('#email').fill(`weak-${ts}@dime.test`)
    await page.locator('#password').fill('short')
    await page.locator('#confirmPassword').fill('short')
    await page.getByRole('button', { name: /create account/i }).click()

    await expect(
      page.getByText(/password must be at least 8 characters/i).first()
    ).toBeVisible()
  })

  test('logging in lands on /log with the TopBar title "Log"', async ({
    page,
    testUser,
  }) => {
    await loginViaUI(page, testUser)
    await expect(page).toHaveURL(/\/log$/)
  })
})
