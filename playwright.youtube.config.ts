import { defineConfig } from '@playwright/test';
import database from './playwright.database.config';

// Deliberate external-provider check, excluded from regular local/CI suites.
export default defineConfig(database, {
  testMatch: 'youtube.integration.spec.ts',
  timeout: 120_000,
  use: { ...database.use, trace: 'off', video: 'off', screenshot: 'off' },
});
