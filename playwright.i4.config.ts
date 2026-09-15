import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['i4-localization.spec.ts', 'pdf-cover.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: '.private/e6-local-pilot/i4-results',
  webServer: undefined,
  use: {
    baseURL: 'http://localhost:3201',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
