import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'branding.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: process.env.CI ? 'github' : 'list',
  webServer: {
    command: 'npm run start -- --hostname localhost --port 3102',
    url: 'http://localhost:3102',
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3102',
      OPENMEMBERS_CONFIG_FILE: 'e2e/fixtures/installation-garden.json',
    },
  },
  use: { baseURL: 'http://localhost:3102', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
