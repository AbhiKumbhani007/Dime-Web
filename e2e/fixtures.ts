import { test as base, expect, type APIRequestContext } from '@playwright/test'
import { registerTestUser, authedContext, type TestUser } from './helpers/api'
import { loginViaUI } from './helpers/auth'

export { loginViaUI }

type Fixtures = {
  testUser: TestUser
  api: APIRequestContext
}

/**
 * Test fixture that mints a fresh user + authenticated API context per test.
 * Use `authedPage` fixture below when you also want an already-signed-in page.
 */
export const test = base.extend<Fixtures>({
  testUser: async ({ request }, use) => {
    const user = await registerTestUser(request)
    await use(user)
    // Optional cleanup: could DELETE /api/auth/me here, but leaving data in
    // the dev DB is fine for local runs and avoids extra latency.
  },

  api: async ({ testUser }, use) => {
    const ctx = await authedContext(testUser)
    await use(ctx)
    await ctx.dispose()
  },
})

/** Page that's already signed in via the UI. */
export const authedTest = test.extend<{ authedPageReady: true }>({
  authedPageReady: async ({ page, testUser }, use) => {
    await loginViaUI(page, testUser)
    await use(true)
  },
})

export { expect }
