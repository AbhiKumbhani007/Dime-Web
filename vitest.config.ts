import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Playwright E2E tests run under `@playwright/test`, not Vitest.
      'e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        '**/node_modules/**',
        '**/.next/**',
        'e2e/**',
        '**/*.config.*',
        'src/test/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Next.js's webpack build resolves `server-only` to this same no-op
      // file via the `react-server` condition; Vitest doesn't set that
      // condition, so without this alias every lib/server/* import throws.
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
})
