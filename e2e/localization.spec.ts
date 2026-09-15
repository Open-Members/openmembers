import { test, expect, type Page } from './fixtures/database-test';
import { localBrowserContext } from './fixtures/database-context.mjs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import en from '../core/i18n/locales/en';
import pt from '../core/i18n/locales/pt';
import es from '../core/i18n/locales/es';
import { browserTestTarget } from './fixtures/test-target.mjs';

const catalogs = { en, pt, es };
const headings = { en: 'Settings', pt: 'Configurações', es: 'Configuración' };
const nativeNames = { en: 'English', pt: 'Português', es: 'Español' };
const { appOrigin, apiOrigin } = browserTestTarget();

test('account language, settings and navigation persist across locales and browsers', async ({ page, browser, isMobile, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  if (baseURL !== appOrigin) throw new Error('Localization tests require the documented local preview origin.');
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (api !== apiOrigin || !key) throw new Error('Localization tests require the guarded local Supabase environment.');
  const service = createClient(apiOrigin, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `locale-browser-${randomUUID()}@example.test`;
  const password = `Locale-${randomUUID()}-aA9!`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Locale Fixture' } });
  expect(created.error).toBeNull();
  const userId = created.data.user!.id;
  const errors: string[] = [];
  const observe = (target: Page) => {
    target.on('pageerror', error => errors.push(error.message));
    target.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  };
  observe(page);
  const signIn = async (target: Page) => {
    await target.goto(`${baseURL}/login`);
    await target.locator('input[name="email"]').fill(email);
    await target.locator('input[name="password"]').fill(password);
    await target.locator('form button[type="submit"]').click();
    await expect(target).toHaveURL(/\/dashboard$/);
  };

  try {
    expect((await service.from('profiles').update({ role: 'admin' }).eq('id', userId)).error).toBeNull();
    await signIn(page);
    await page.goto(`${baseURL}/settings`);
    for (const locale of ['en', 'pt', 'es'] as const) {
      const messages = catalogs[locale];
      // The autonym remains readable even before changing the current language.
      // Setting a cookie can first emit an RSC navigation with the same URL.
      // Wait for the actual document GET from window.location.reload, not that
      // soft-navigation event, before testing an additional manual reload.
      const languageReload = page.waitForResponse(response => response.request().isNavigationRequest()
        && response.request().method() === 'GET' && new URL(response.url()).pathname === '/settings');
      await page.getByRole('button').filter({ has: page.locator(`p[lang="${locale}"]`, { hasText: nativeNames[locale] }) }).click();
      await (await languageReload).finished();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(headings[locale]);
      await expect.poll(async () => (await service.from('profiles').select('preferred_locale').eq('id', userId).single()).data?.preferred_locale).toBe(locale);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(headings[locale]);
      await expect(page.getByRole('heading', { name: messages.settings.language.heading, exact: true })).toBeVisible();

      // An actual rejected server action must show the current language.
      const passwordSection = page.locator('section').filter({ has: page.getByRole('heading', { name: messages.settings.password.heading, exact: true }) });
      await passwordSection.getByRole('button', { name: messages.settings.actions.change, exact: true }).click();
      await passwordSection.locator('input[type="password"]').nth(0).fill('short');
      await passwordSection.locator('input[type="password"]').nth(1).fill('short');
      await passwordSection.getByRole('button', { name: messages.settings.password.update, exact: true }).click();
      await expect(passwordSection.getByText(messages.settings.errors.invalidPassword, { exact: true })).toBeVisible();
      await passwordSection.getByRole('button', { name: messages.settings.actions.cancel, exact: true }).click();
      await page.getByRole('button', { name: messages.navigation.accountMenu, exact: true }).click();
      const menu = page.getByRole('menu');
      await expect(menu.getByRole('menuitem', { name: messages.navigation.settings, exact: true })).toBeVisible();
      await expect(menu.getByText(messages.navigation.theme, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: messages.navigation.accountMenu, exact: true }).click();
      await expect(menu).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`settings-${locale}.png`), fullPage: true, animations: 'disabled' });

      await page.goto(`${baseURL}/admin`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      if (isMobile) {
        await page.getByRole('button', { name: messages.navigation.openAdminMenu, exact: true }).click();
        const drawer = page.getByRole('dialog', { name: messages.navigation.adminNavigation, exact: true });
        await expect(drawer.getByRole('link', { name: messages.navigation.adminItems.reports, exact: true })).toBeVisible();
        await expect(drawer).toHaveCSS('transform', 'none');
        await page.screenshot({ path: testInfo.outputPath(`admin-menu-${locale}.png`), animations: 'disabled' });
        await drawer.getByRole('button', { name: messages.navigation.closeAdminMenu, exact: true }).click();
      } else {
        const sidebar = page.getByRole('complementary', { name: messages.navigation.adminNavigation, exact: true });
        await expect(sidebar.getByRole('link', { name: messages.navigation.adminItems.reports, exact: true })).toBeVisible();
      }
      await page.getByRole('button', { name: messages.navigation.commands.open, exact: true }).click();
      const palette = page.getByRole('dialog', { name: messages.navigation.commands.title, exact: true });
      await palette.getByRole('textbox', { name: messages.navigation.commands.query, exact: true }).fill(messages.navigation.adminItems.reports);
      await expect(palette.getByText(messages.navigation.adminItems.reports, { exact: true })).toBeVisible();
      await palette.getByRole('button', { name: messages.navigation.commands.close, exact: true }).click();
      await page.goto(`${baseURL}/settings`);
    }

    // A fresh cookie jar/browser language must not override the account's ES.
    const freshContext = await browser.newContext({ locale: 'en-US', baseURL });
    try {
      const identity = localBrowserContext(process.env, {
        testId: testInfo.testId, projectName: testInfo.project.name,
        retry: testInfo.retry, repeatEachIndex: testInfo.repeatEachIndex,
      }, baseURL);
      await freshContext.route(identity.matchesUrl, async route => {
        await route.continue({ headers: { ...await route.request().allHeaders(), ...identity.headers } });
      });
      const freshPage = await freshContext.newPage();
      observe(freshPage);
      await signIn(freshPage);
      await freshPage.goto(`${baseURL}/settings`);
      await expect(freshPage.locator('html')).toHaveAttribute('lang', 'es');
      await expect(freshPage.getByRole('heading', { level: 1 })).toHaveText('Configuración');
      // Logout keeps the anonymous language cookie, but a new login still uses
      // the saved preference. Only the test's own account/session is affected.
      await freshPage.getByRole('button', { name: es.settings.session.signOut, exact: true }).click();
      await expect(freshPage).toHaveURL(/\/login$/);
      await signIn(freshPage);
      await freshPage.goto(`${baseURL}/settings`);
      await expect(freshPage.locator('html')).toHaveAttribute('lang', 'es');
    } finally {
      await freshContext.close();
    }
    expect(errors).toEqual([]);
  } finally {
    expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});
