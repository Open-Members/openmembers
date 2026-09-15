import { test as base, expect } from '@playwright/test';
import { localBrowserContext } from './database-context.mjs';

export const test = base.extend<{ localRequestIdentity: void }>({
  localRequestIdentity: [async ({ context, baseURL }, use, testInfo) => {
    const identity = localBrowserContext(process.env, {
      testId: testInfo.testId,
      projectName: testInfo.project.name,
      retry: testInfo.retry,
      repeatEachIndex: testInfo.repeatEachIndex,
    }, baseURL);
    await context.route(identity.matchesUrl, async route => {
      await route.continue({
        headers: { ...await route.request().allHeaders(), ...identity.headers },
      });
    });
    await use();
  }, { auto: true }],
});

export { expect };
export type { Page } from '@playwright/test';
