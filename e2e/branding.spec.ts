import { test, expect } from '@playwright/test';

test('a second installation changes identity, content, theme and metadata without changing the build', async ({ page }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== 'localhost') {
      external.push(new URL(route.request().url()).hostname);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Jardim Academy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conhecimento que floresce');
  await expect(page.getByText('Cursos para aprender no seu ritmo.')).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Aprenda com a Jardim Academy.');
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', '/branding-example.svg');
  const primary = await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--color-primary').trim());
  expect(primary.toLowerCase()).toBe('#0f766e');
  await expect(page.locator('img[src="/branding-example.svg"]:visible').first()).toBeVisible();
  expect(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Georgia');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('garden-dark.png'), fullPage: true, animations: 'disabled' });
  await page.evaluate(() => localStorage.setItem('openmembers:theme', 'light'));
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath('garden-light.png'), fullPage: true, animations: 'disabled' });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('manifest uses the same installation identity and icon', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.name).toBe('Jardim Academy');
  expect(manifest.short_name).toBe('Jardim');
  expect(manifest.description).toBe('Aprenda com a Jardim Academy.');
  expect(manifest.theme_color.toLowerCase()).toBe('#0f766e');
  expect(manifest.icons.some((icon: { src: string }) => icon.src === '/branding-example.svg')).toBe(true);
  expect((await request.get('/branding-example.svg')).status()).toBe(200);
});

test('public policy and contact destinations come from installation settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('footer a[href="https://policies.example.test/terms"]')).toBeVisible();
  await expect(page.locator('footer a[href="https://policies.example.test/privacy"]')).toBeVisible();
  await expect(page.locator('footer a[href="mailto:support@jardim.example.test"]')).toBeVisible();
  for (const path of ['/terms', '/privacy']) {
    await page.goto(path);
    await expect(page.locator(`main a[href="https://policies.example.test${path}"]`)).toBeVisible();
    expect(await page.content()).not.toContain('support@example.com');
  }
});

test('unconfigured member routes preserve the new brand in their setup state', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page).toHaveTitle('Setting up — Jardim Academy');
  await expect(page.getByText('Jardim Academy', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This members area is being set up.');
});
