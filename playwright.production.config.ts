import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:8791';

export default defineConfig({
  testDir: './tests/production',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
  },
  webServer: {
    command: 'pnpm exec wrangler dev --ip 127.0.0.1 --port 8791',
    url: `${baseURL}/day/1`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
