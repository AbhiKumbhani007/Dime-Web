import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for dime-web E2E.
 *
 * The design defines three frames — 412 mobile, 834 tablet, 1440 desktop — and
 * the shell changes materially at each (bottom nav → sidebar rail → expanded
 * sidebar). All three run by default so a regression in the viewport nobody is
 * currently looking at still fails.
 *
 * Serialized to a single worker to stay under the backend's 100/min rate limit.
 * Set E2E_MOBILE_ONLY=1 for a fast inner-loop run.
 */

const mobileOnly = process.env.E2E_MOBILE_ONLY === '1'

const mobileProject = {
  name: 'mobile-chromium',
  // Pixel 7 is Chromium-based; iPhone 13 would require WebKit.
  use: { ...devices['Pixel 7'] },
}

const tabletProject = {
  name: 'tablet-chromium',
  use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1050 } },
}

const desktopProject = {
  name: 'desktop-chromium',
  use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 940 } },
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },

  // Serialize to avoid the backend's global 100/min rate limit.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5_000,
  },

  projects: mobileOnly ? [mobileProject] : [mobileProject, tabletProject, desktopProject],

  webServer: [
    {
      command: 'npm run dev',
      cwd: '../dime-api',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 90_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
