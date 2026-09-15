import { createClient } from '@supabase/supabase-js';
import { createTranslator } from 'next-intl';
import { randomUUID } from 'node:crypto';
import en from '../core/i18n/locales/en';
import es from '../core/i18n/locales/es';
import pt from '../core/i18n/locales/pt';
import { expect, test, type Page } from './fixtures/database-test';
import { browserTestTarget } from './fixtures/test-target.mjs';

const { appOrigin, apiOrigin } = browserTestTarget();
const catalogs = { en, pt, es } as const;

function localAdmin(baseURL: string | undefined) {
  if (
    baseURL !== appOrigin ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== apiOrigin ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      'I3 localization tests require the guarded local preview and Supabase.',
    );
  }
  return createClient(apiOrigin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

for (const locale of ['en', 'pt', 'es'] as const) {
  test(`${locale}: all I3 administration surfaces follow the profile language`, async ({
    page,
    context,
    baseURL,
    isMobile,
  }, testInfo) => {
    test.setTimeout(240_000);
    const service = localAdmin(baseURL);
    const messages = catalogs[locale];
    const t = createTranslator({ locale, messages });
    const token = randomUUID();
    const email = `i3-e2e-${locale}-${testInfo.project.name}-${token}@example.test`;
    const password = `I3-${randomUUID()}-aA9!`;
    const errors: string[] = [];
    let currentPath = '/login';
    let userId: string | undefined;

    page.on('pageerror', (error) => errors.push(`${currentPath}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const isSandboxInstrumentationWarning =
        message.location().url === 'about:srcdoc' &&
        message.text() ===
          "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.";
      if (!isSandboxInstrumentationWarning) {
        errors.push(`${currentPath}: ${message.text()}`);
      }
    });

    async function open(path: string) {
      currentPath = path;
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      if (isMobile) {
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          `${path} must not overflow the mobile viewport`,
        ).toBe(true);
      }
    }

    try {
      const created = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: `I3 fixture ${locale}` },
      });
      expect(created.error).toBeNull();
      userId = created.data.user?.id;
      expect(userId).toBeTruthy();

      const updated = await service
        .from('profiles')
        .update({ role: 'admin', status: 'active', preferred_locale: locale })
        .eq('id', userId!)
        .select('role,status,preferred_locale')
        .single();
      expect(updated.error).toBeNull();
      expect(updated.data).toEqual({
        role: 'admin',
        status: 'active',
        preferred_locale: locale,
      });

      const conflictingLocale = locale === 'en' ? 'es' : 'en';
      await context.addCookies([
        { name: 'NEXT_LOCALE', value: conflictingLocale, url: appOrigin },
      ]);
      await signIn(page, email, password);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);

      await test.step('overview and reports', async () => {
        await open('/admin');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminOverview.dashboard'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('link', {
            name: t('adminOverview.createCourse'),
            exact: true,
          }),
        ).toBeVisible();

        if (isMobile) {
          await page
            .getByRole('button', {
              name: t('navigation.openAdminMenu'),
              exact: true,
            })
            .click();
          const drawer = page.getByRole('dialog', {
            name: t('navigation.adminNavigation'),
            exact: true,
          });
          await expect(
            drawer.getByRole('link', {
              name: t('navigation.adminItems.reports'),
              exact: true,
            }),
          ).toBeVisible();
          await drawer
            .getByRole('button', {
              name: t('navigation.closeAdminMenu'),
              exact: true,
            })
            .click();
        }

        await open('/admin/reports');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminReports.reports'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: t('adminReports.exportCsv'),
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`block-a-${locale}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      });

      await test.step('content and schedule', async () => {
        await open('/admin/content');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminContent.courses'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: t('adminContent.createCourse'),
            exact: true,
          }),
        ).toBeVisible();

        await open('/admin/live-classes');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminContent.liveClasses'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: t('adminContent.newLiveClass'),
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`block-b-${locale}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      });

      await test.step('people, access, support and authorization', async () => {
        await open('/admin/users');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminPeople.students'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: t('adminPeople.addStudent'),
            exact: true,
          }),
        ).toBeVisible();

        await open('/admin/offers');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminAccess.offers'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: t('adminAccess.enrollments'),
            exact: true,
          }),
        ).toBeVisible();

        await open('/admin/support');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('support.admin.title'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('navigation', {
            name: t('support.admin.filter.ariaLabel'),
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`block-c-${locale}.png`),
          fullPage: true,
          animations: 'disabled',
        });

        const demoted = await service
          .from('profiles')
          .update({ role: 'user' })
          .eq('id', userId!)
          .select('role')
          .single();
        expect(demoted.error).toBeNull();
        expect(demoted.data?.role).toBe('user');
        currentPath = '/admin';
        await page.goto('/admin');
        await expect(page).toHaveURL(/\/dashboard$/);
        const promoted = await service
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', userId!)
          .select('role')
          .single();
        expect(promoted.error).toBeNull();
        expect(promoted.data?.role).toBe('admin');
      });

      await test.step('appearance, communication and integrations', async () => {
        await open('/admin/announcements');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminOperations.announcements.header.title'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: t('adminOperations.announcements.actions.send'),
            exact: true,
          }),
        ).toBeVisible();

        await open('/admin/emails');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminOperations.email.page.title'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', {
            level: 3,
            name: t('adminOperations.email.sender.title'),
            exact: true,
          }),
        ).toBeVisible();
        const emailPreview = page.locator('iframe[sandbox]');
        await expect(emailPreview).toHaveAttribute('srcdoc', /<html/i);
        expect((await emailPreview.getAttribute('srcdoc'))?.toLowerCase()).not.toContain(
          '<script',
        );

        await open('/admin/home');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminOperations.home.header.title'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: t('adminOperations.home.addRow'),
            exact: true,
          }),
        ).toBeVisible();

        await open('/admin/menu');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminOperations.menu.header.title'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', {
            name: t('adminOperations.menu.addItem'),
            exact: true,
          }),
        ).toBeVisible();

        await open('/admin/branding');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminOperations.branding.header.title'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('textbox', {
            name: t('adminOperations.branding.identity.siteName'),
            exact: true,
          }),
        ).toBeVisible();

        await open('/admin/integrations');
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: t('adminOperations.integrations.header.title'),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('tab', {
            name: t('adminOperations.integrations.tabs.providers'),
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`block-d-${locale}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      });

      expect(errors).toEqual([]);
    } finally {
      await page.goto('about:blank');
      if (userId) {
        expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
      }
    }
  });
}
