import { defineConfig, devices } from '@playwright/test';

// Render the real decorative banner without Auth/Database infrastructure.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'hero-banner.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
