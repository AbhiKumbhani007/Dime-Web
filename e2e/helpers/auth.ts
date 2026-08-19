import type { Page } from '@playwright/test'
import type { TestUser } from './api'

/**
 * Sign in through the real login form so the app's in-memory auth state
 * (zustand) is fully initialized. Returns once /log is rendered.
 *
 * Storage-based shortcut is not viable: useAuthStore only persists `user`
 * (accessToken is memory-only), and the (app) route guard bounces the page
 * back to /login whenever accessToken is null.
 */
export async function loginViaUI(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(user.email)
  await page.locator('#password').fill(user.password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL('**/log', { timeout: 10_000 })
}
