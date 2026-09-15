import { test, expect, type Page } from './fixtures/database-test';
import type { BrowserContext, Request } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import en from '../core/i18n/locales/en';
import pt from '../core/i18n/locales/pt';
import es from '../core/i18n/locales/es';
import { browserTestTarget } from './fixtures/test-target.mjs';

const catalogs = { en, pt, es };
type Locale = keyof typeof catalogs;
const { appOrigin, apiOrigin, mailboxOrigin } = browserTestTarget();

function localAdmin(baseURL: string | undefined) {
  if (baseURL !== appOrigin || process.env.NEXT_PUBLIC_SUPABASE_URL !== apiOrigin
    || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Auth localization tests require the guarded local preview and Supabase.');
  }
  return createClient(apiOrigin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function chooseVisitorLanguage(context: BrowserContext, locale: Locale) {
  await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: appOrigin }]);
}

function observeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

function hasRedirectAncestor(request: Request, pathname: string) {
  let ancestor = request.redirectedFrom();
  while (ancestor) {
    if (new URL(ancestor.url()).pathname === pathname) return true;
    ancestor = ancestor.redirectedFrom();
  }
  return false;
}

function observeAuthenticatedLoginPrefetch(page: Page) {
  const login = page.waitForResponse(response => {
    const request = response.request();
    const url = new URL(response.url());
    return url.origin === appOrigin
      && url.pathname === '/login'
      && url.searchParams.has('_rsc')
      && request.method() === 'GET'
      && request.resourceType() === 'fetch'
      && request.headers()['next-router-prefetch'] === '1'
      && request.headers().rsc === '1';
  }, { timeout: 30_000 });

  const suspended = page.waitForResponse(response => {
    const request = response.request();
    const url = new URL(response.url());
    return url.origin === appOrigin
      && url.pathname === '/suspended'
      && url.searchParams.has('_rsc')
      && request.method() === 'GET'
      && request.resourceType() === 'fetch'
      && request.headers()['next-router-prefetch'] === '1'
      && request.headers().rsc === '1'
      && hasRedirectAncestor(request, '/login');
  }, { timeout: 30_000 });

  return { login, suspended };
}

function waitForLoginDocument(page: Page) {
  return page.waitForResponse(response => {
    const request = response.request();
    const url = new URL(response.url());
    return url.origin === appOrigin
      && url.pathname === '/login'
      && request.method() === 'GET'
      && request.isNavigationRequest()
      && request.resourceType() === 'document';
  }, { timeout: 30_000 });
}

function isLocale(value: string | undefined): value is Locale {
  return value === 'en' || value === 'pt' || value === 'es';
}

async function submit(page: Page) {
  await page.locator('form button[type="submit"]').click();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await submit(page);
}

async function verificationLink(email: string, subject: RegExp) {
  let id: string | undefined;
  await expect.poll(async () => {
    const response = await fetch(`${mailboxOrigin}/api/v1/messages`);
    if (!response.ok) throw new Error('The isolated local mailbox is unavailable.');
    const data = await response.json();
    id = data.messages.find((message: { ID: string; Subject: string; To: { Address: string }[] }) =>
      subject.test(message.Subject) && message.To.some(to => to.Address === email))?.ID;
    return Boolean(id);
  }, { timeout: 15_000 }).toBe(true);
  const response = await fetch(`${mailboxOrigin}/api/v1/message/${id}`);
  if (!response.ok) throw new Error('The fixture verification email is unavailable.');
  const message = await response.json();
  const link = String(message.HTML).match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]?.replaceAll('&amp;', '&');
  if (!link || new URL(link).origin !== apiOrigin) throw new Error('Expected a verification link for the isolated local Auth service.');
  const destination = new URL(link).searchParams.get('redirect_to');
  if (!destination || new URL(destination).origin !== appOrigin) throw new Error('Expected the local preview callback destination.');
  return link;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function expectMetadata(page: Page, title: string, description?: string) {
  // Branding remains authored content, so match the translated framing while
  // allowing the installation's current name instead of overwriting it.
  const parts = title.split('{siteName}');
  await expect(page).toHaveTitle(new RegExp(`^${parts.map(escapeRegExp).join('.+')}$`));
  if (description) await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', description);
}

async function expectManifest(page: Page, locale: Locale, acceptLanguage = 'en-US') {
  const response = await page.request.get('/manifest.webmanifest', { headers: { 'accept-language': acceptLanguage } });
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.lang).toBe(locale);
  expect(manifest.description).toBe(catalogs[locale].landing.metadataDescription);
}

async function expectNativeManifest(page: Page, locale: Locale) {
  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('crossorigin', 'use-credentials');
  const cdp = await page.context().newCDPSession(page);
  try {
    // An API request shares cookies by default. Chromium's actual manifest
    // request needs the credentialed link to honor an account or locale cookie.
    const result = await cdp.send('Page.getAppManifest');
    expect(result.errors).toEqual([]);
    const manifestUrl = new URL(result.url);
    expect(manifestUrl.origin).toBe(appOrigin);
    expect(manifestUrl.pathname).toBe('/manifest.webmanifest');
    expect(manifestUrl.searchParams.get('locale')).toBe(locale);
    expect(result.data).toBeTruthy();
    const manifest = JSON.parse(result.data!);
    expect(manifest.lang).toBe(locale);
    expect(manifest.description).toBe(catalogs[locale].landing.metadataDescription);
  } finally {
    await cdp.detach();
  }
}

for (const locale of ['en', 'pt', 'es'] as const) {
  test(`${locale}: public entry, Auth metadata and rejected requests use the visitor language`, async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(100_000);
    localAdmin(baseURL);
    const messages = catalogs[locale];
    const errors = observeErrors(page);
    await expectManifest(page, locale, { en: 'en-US', pt: 'pt-BR', es: 'es-ES' }[locale]);
    await chooseVisitorLanguage(context, locale);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.landing.home.title);
    await expect(page.getByRole('link', { name: messages.landing.home.login, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: messages.landing.home.register, exact: true })).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', messages.landing.metadataDescription);
    await expectManifest(page, locale);
    await expectNativeManifest(page, locale);

    await page.goto('/setup');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.authPages.setup.title);
    await expect(page.getByText(messages.authPages.setup.description, { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: messages.authPages.setup.backToHome, exact: true })).toBeVisible();
    await expectMetadata(page, messages.authPages.setup.metadataTitle);

    const publicAuthPages = [
      ['/login', messages.authPages.login],
      ['/register', messages.authPages.register],
      ['/forgot-password', messages.authPages.forgotPassword],
      ['/reset-password', messages.authPages.resetPassword],
    ] as const;
    for (const [path, expected] of publicAuthPages) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(expected.title);
      await expect(page.getByText(expected.subtitle, { exact: true })).toBeVisible();
      await expectMetadata(page, expected.metadataTitle, expected.metadataDescription);
      // Native browser validation would otherwise be English in this context.
      await expect(page.locator('form')).toHaveAttribute('novalidate', '');
    }

    await page.goto('/login');
    await expect(page.getByLabel(messages.auth.fields.email, { exact: true })).toBeVisible();
    await expect(page.getByLabel(messages.auth.fields.password, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: messages.auth.shared.showPassword, exact: true }).click();
    await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: messages.auth.shared.hidePassword, exact: true }).click();
    await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'password');

    await page.locator('input[name="email"]').fill('invalid-address');
    await page.locator('input[name="password"]').fill('Fixture-invalid-A9!');
    await submit(page);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(messages.auth.errors.invalidEmail);
    await page.locator('input[name="email"]').fill(`auth-i2a-missing-${randomUUID()}@example.test`);
    await page.locator('input[name="password"]').fill('Fixture-invalid-A9!');
    await submit(page);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(messages.auth.errors.invalidCredentials);
    await page.screenshot({ path: testInfo.outputPath(`login-invalid-${locale}.png`), fullPage: true, animations: 'disabled' });

    await page.goto('/api/auth/callback?token_hash=invalid-fixture-token&type=signup');
    await expect(page).toHaveURL(/\/login\?error=auth_failed$/);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(messages.authPages.login.callbackError);
    expect(errors).toEqual([]);
  });

  test(`${locale}: signup confirmation and recovery keep the interface language`, async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(110_000);
    const service = localAdmin(baseURL);
    const messages = catalogs[locale];
    const errors = observeErrors(page);
    const email = `auth-i2a-signup-${randomUUID()}@example.test`;
    const password = `Auth-${randomUUID()}-aA9!`;
    const newPassword = `Reset-${randomUUID()}-aA9!`;
    let userId: string | undefined;
    try {
      await chooseVisitorLanguage(context, locale);
      await page.goto('/register');
      await page.locator('input[name="displayName"]').fill('Auth I2a Fixture');
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
      await submit(page);
      await expect(page.getByRole('heading', { name: messages.auth.signUp.confirmationTitle, exact: true })).toBeVisible();
      await expect(page.getByText(email, { exact: true })).toBeVisible();
      await expect(page.getByText(messages.auth.signUp.confirmationHelp, { exact: true })).toBeVisible();
      const profile = await service.from('profiles').select('id,role,preferred_locale').eq('email', email).single();
      expect(profile.error).toBeNull();
      userId = profile.data?.id;
      expect(profile.data?.role).toBe('user');
      expect(profile.data?.preferred_locale).toBeNull();
      await page.screenshot({ path: testInfo.outputPath(`signup-confirmation-${locale}.png`), fullPage: true, animations: 'disabled' });

      // Email templates themselves belong to I4; this proves the local link
      // establishes a session and keeps the visitor's negotiated UI language.
      await page.goto(await verificationLink(email, /confirm/i));
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      // Detach authenticated components before changing their browser session;
      // otherwise their in-flight REST reads race the test's cookie removal.
      await page.goto('about:blank');
      await context.clearCookies();
      await chooseVisitorLanguage(context, locale);

      for (const resetEmail of [`auth-i2a-unknown-${randomUUID()}@example.test`, email]) {
        await page.goto('/forgot-password');
        await page.locator('input[name="email"]').fill(resetEmail);
        await submit(page);
        await expect(page.getByRole('heading', { name: messages.auth.recovery.confirmationTitle, exact: true })).toBeVisible();
        await expect(page.getByText(messages.auth.recovery.confirmationDescription, { exact: true })).toBeVisible();
        await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
      }

      await page.goto(await verificationLink(email, /reset/i));
      await expect(page).toHaveURL(/\/reset-password$/);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.authPages.resetPassword.title);
      await page.locator('input[name="password"]').fill(newPassword);
      await page.locator('input[name="confirmPassword"]').fill(`${newPassword}different`);
      await submit(page);
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(messages.auth.errors.passwordMismatch);
      await page.locator('input[name="password"]').fill('short');
      await page.locator('input[name="confirmPassword"]').fill('short');
      await submit(page);
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(messages.auth.errors.passwordTooShort);
      await page.screenshot({ path: testInfo.outputPath(`recovery-validation-${locale}.png`), fullPage: true, animations: 'disabled' });
      await page.locator('input[name="password"]').fill(newPassword);
      await page.locator('input[name="confirmPassword"]').fill(newPassword);
      await submit(page);
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const client = createClient(apiOrigin, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      expect((await client.auth.signInWithPassword({ email, password: newPassword })).error).toBeNull();
      expect((await client.auth.signInWithPassword({ email, password })).error).not.toBeNull();
      expect(errors).toEqual([]);
    } finally {
      if (!userId) userId = (await service.from('profiles').select('id').eq('email', email).maybeSingle()).data?.id;
      if (userId) expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  });

  test(`${locale}: required password change and suspension honor the account preference`, async ({ page, context, baseURL, isMobile }, testInfo) => {
    test.setTimeout(120_000);
    const service = localAdmin(baseURL);
    const messages = catalogs[locale];
    const errors = observeErrors(page);
    const userIds: string[] = [];
    const password = `Initial-${randomUUID()}-aA9!`;
    try {
      for (const state of ['change', 'suspended'] as const) {
        const email = `auth-i2a-${state}-${randomUUID()}@example.test`;
        const created = await service.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { display_name: 'Auth I2a Fixture' },
        });
        expect(created.error).toBeNull();
        const userId = created.data.user!.id;
        userIds.push(userId);
        expect((await service.from('profiles').update({
          preferred_locale: locale,
          must_change_password: state === 'change',
          status: state === 'suspended' ? 'suspended' : 'active',
        }).eq('id', userId)).error).toBeNull();

        await page.goto('about:blank');
        await context.clearCookies();
        // English browser and cookie must not override the persisted profile.
        await chooseVisitorLanguage(context, 'en');
        const loginPrefetch = state === 'suspended'
          ? observeAuthenticatedLoginPrefetch(page)
          : undefined;
        await signIn(page, email, password);
        if (state === 'change') {
          await expect(page).toHaveURL(/\/change-password$/);
          await expect(page.locator('html')).toHaveAttribute('lang', locale);
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.authPages.changePassword.title);
          await expectMetadata(page, messages.authPages.changePassword.metadataTitle, messages.authPages.changePassword.metadataDescription);
          await expectManifest(page, locale);
          await expectNativeManifest(page, locale);
          const newPassword = `Permanent-${randomUUID()}-aA9!`;
          await page.locator('input[name="password"]').fill(newPassword);
          await page.locator('input[name="confirmPassword"]').fill(`${newPassword}different`);
          await submit(page);
          await expect(page.getByRole('main').getByRole('alert')).toHaveText(messages.auth.errors.passwordMismatch);
          await page.locator('input[name="password"]').fill(newPassword);
          await page.locator('input[name="confirmPassword"]').fill(newPassword);
          await submit(page);
          await expect(page).toHaveURL(/\/dashboard$/);
          await expect.poll(async () => (await service.from('profiles').select('must_change_password').eq('id', userId).single()).data?.must_change_password).toBe(false);
        } else {
          await expect(page).toHaveURL(/\/suspended$/);
          await expect(page.locator('html')).toHaveAttribute('lang', locale);
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.auth.suspended.title);
          await expect(page.getByText(messages.auth.suspended.description, { exact: true })).toBeVisible();
          await expectMetadata(page, messages.authPages.suspended.metadataTitle, messages.authPages.suspended.metadataDescription);
          await expectManifest(page, locale);
          await expectNativeManifest(page, locale);

          const publicNavigation = page.getByRole('navigation', { name: messages.landing.navbar.navigationLabel, exact: true });
          const mobileMenuToggle = publicNavigation.getByRole('button', { name: messages.landing.navbar.toggleMenu, exact: true });
          if (isMobile) await mobileMenuToggle.click();
          const publicLoginLink = publicNavigation.getByRole('link', { name: messages.landing.navbar.login, exact: true });
          await expect(publicLoginLink).toBeVisible();
          if (!isMobile) await publicLoginLink.hover();
          const [prefetchedLogin, prefetchedSuspended] = await Promise.all([
            loginPrefetch!.login,
            loginPrefetch!.suspended,
          ]);
          expect(prefetchedLogin.status()).toBe(307);
          const prefetchDestination = prefetchedLogin.headers().location;
          expect(prefetchDestination).toBeTruthy();
          expect(new URL(prefetchDestination, appOrigin).pathname).toBe('/suspended');
          expect(await prefetchedLogin.finished()).toBeNull();
          expect(prefetchedSuspended.status()).toBe(200);
          expect(new URL(prefetchedSuspended.url()).pathname).toBe('/suspended');
          // A speculative RSC stream need not finish before the user signs out.
          // The completed login document below proves the actual navigation.
          expect(prefetchedSuspended.headers()['content-type']).toContain('text/x-component');
          if (isMobile) {
            await mobileMenuToggle.click();
            await expect(page.locator('#public-mobile-menu')).toHaveCount(0);
          }

          await page.screenshot({ path: testInfo.outputPath(`suspended-${locale}.png`), fullPage: true, animations: 'disabled' });
          const loginDocument = waitForLoginDocument(page);
          const authLogout = page.waitForResponse(response => {
            const url = new URL(response.url());
            return url.origin === apiOrigin
              && url.pathname === '/auth/v1/logout'
              && response.request().method() === 'POST';
          }, { timeout: 30_000 });
          await page.getByRole('button', { name: messages.auth.suspended.signOut, exact: true }).click();
          const [logoutResponse, loginResponse] = await Promise.all([authLogout, loginDocument]);
          expect(logoutResponse.status()).toBe(204);
          expect(loginResponse.status()).toBe(200);
          expect(await loginResponse.finished()).toBeNull();
          expect(loginResponse.request().headers()['next-router-prefetch']).toBeUndefined();
          await expect(page).toHaveURL(/\/login$/);

          const signedOutLocaleValue = (await context.cookies(appOrigin))
            .find(cookie => cookie.name === 'NEXT_LOCALE')?.value;
          expect(isLocale(signedOutLocaleValue)).toBe(true);
          if (!isLocale(signedOutLocaleValue)) throw new Error('Expected a supported signed-out locale cookie.');
          const signedOutMessages = catalogs[signedOutLocaleValue];
          await expect(page.locator('html')).toHaveAttribute('lang', signedOutLocaleValue);
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(signedOutMessages.authPages.login.title);
          await expect(page.getByLabel(signedOutMessages.auth.fields.email, { exact: true })).toBeVisible();
        }
      }
      expect(errors).toEqual([]);
    } finally {
      for (const userId of userIds) expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  });
}
