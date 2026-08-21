import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for dime-web E2E.
 *
 * Default run targets mobile-chromium only (the app is mobile-first) and is
 * serialized to a single worker to stay under the backend's 100/min rate
 * limit. To also include the desktop project in a run, set E2E_DESKTOP=1.
 */

const includeDesktop = process.env.E2E_DESKTOP === '1'

const mobileProject = {
  name: 'mobile-chromium',
  // Pixel 7 is Chromium-based; iPhone 13 would require WebKit.
  use: { ...devices['Pixel 7'] },
}

const desktopProject = {
  name: 'desktop-chromium',
  use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
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

  projects: includeDesktop ? [mobileProject, desktopProject] : [mobileProject],

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
