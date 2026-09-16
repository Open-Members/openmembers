import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'admin-i3-localization.spec.ts',
    'tools-localization.spec.ts',
    'learning-localization.spec.ts',
    'localization.spec.ts',
  ],
  // Keep the existing assertions and per-test timeouts; capture English surfaces.
  grep: /(?: en: | account language, settings and navigation persist across locales and browsers$)/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'test-results/documentation',
  webServer: {
    command: 'node scripts/with-local-env.mjs start',
    url: 'http://localhost:3101/login',
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://localhost:3101',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: 'learning-localization.spec.ts',
      grep: / en: /,
      use: { ...devices['Pixel 7'] },
    },
  ],
});
