import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['database.spec.ts', 'admin.spec.ts', 'comments.spec.ts', 'branding-database.spec.ts', 'enrollment-database.spec.ts', 'storage-database.spec.ts', 'localization.spec.ts', 'auth-localization.spec.ts', 'learning-localization.spec.ts', 'tools-localization.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  webServer: {
    command: 'node scripts/with-local-env.mjs start',
    url: 'http://localhost:3101/login',
    reuseExistingServer: false,
  },
  use: { baseURL: 'http://localhost:3101', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
