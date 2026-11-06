import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    // Static production package only (no Vite dev server): the
    // e2e suite runs against the same artifact `npm run serve`
    // produces, bound to loopback only.
    command: 'npm run serve -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60 * 1000,
  },
})
