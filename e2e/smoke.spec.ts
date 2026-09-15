import { test, expect } from '@playwright/test';

// E1 checks the unconfigured build. Auth and seeded database flows belong to E2.
test.describe('Unconfigured installation', () => {
  test('public home renders without external browser requests', async ({ page }) => {
    const externalRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', async route => {
      if (new URL(route.request().url()).hostname !== 'localhost') {
        externalRequests.push(new URL(route.request().url()).hostname);
        await route.abort();
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await expect(page).toHaveTitle('Open Members');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your learning starts here.');
    await page.screenshot({ path: test.info().outputPath('public-home.png'), fullPage: true });
    await page.getByRole('link', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This members area is being set up.');
    expect(externalRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  for (const path of ['/dashboard', '/notifications', '/admin', '/login', '/register', '/reset-password', '/thank-you', '/suspended', '/pt/dashboard']) {
    test(`${path} leads to setup`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/setup$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('This members area is being set up.');
    });
  }

  test('API refuses work until configured', async ({ request }) => {
    for (const path of ['/api/health', '/api/webhooks/stripe', '/api/course-chat']) {
      const response = path === '/api/health'
        ? await request.get(path)
        : await request.post(path, { data: {} });
      expect(response.status()).toBe(503);
      expect(response.headers()['cache-control']).toContain('no-store');
      expect(await response.json()).toEqual({ error: 'not_configured' });
    }
  });

  test('removed campaign pages are unavailable', async ({ request }) => {
    for (const path of ['/free-pdfs', '/platform-tool']) {
      expect((await request.get(path)).status()).toBe(404);
    }
  });

  test('neutral icon and manifest are available', async ({ request }) => {
    expect((await request.get('/icon.svg')).status()).toBe(200);
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    expect((await manifest.json()).name).toBe('Open Members');
  });
});
