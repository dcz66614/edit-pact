import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 240 * 1000,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npm run serve -- --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 60 * 1000,
  },
});
