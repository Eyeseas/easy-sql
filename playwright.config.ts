import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4327';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  timeout: 30_000,
  use: {
    baseURL,
    browserName: 'chromium',
    // Local verification can use installed Chrome; CI keeps Playwright's pinned Chromium.
    channel: process.env.CI ? undefined : 'chrome',
  },
  webServer: {
    command: 'pnpm exec astro dev --host 127.0.0.1 --port 4327',
    url: `${baseURL}/day/1`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
