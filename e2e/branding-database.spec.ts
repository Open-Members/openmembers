import { test, expect, type Page } from './fixtures/database-test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTranslator } from 'next-intl';
import en from '../core/i18n/locales/en';
import { browserTestTarget } from './fixtures/test-target.mjs';

const { apiOrigin: localApi } = browserTestTarget();
const bucket = 'platform-assets';
const publicPrefix = `/storage/v1/object/public/${bucket}/`;
const uploadPrefix = `/storage/v1/object/upload/sign/${bucket}/`;
const lightLabel = 'Logo (light theme)';
const darkLabel = 'Logo (dark theme)';
const t = createTranslator({ locale: 'en', messages: en });

function localAdmin() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== localApi || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Branding integration requires the guarded local runner.');
  }
  return createClient(localApi, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('OpenMembers-local-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

function svgFile(name: string, title: string, color: string, icon = false) {
  const width = icon ? 64 : 512;
  const height = icon ? 64 : 128;
  return {
    name,
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${title}</title><rect width="${width}" height="${height}" rx="12" fill="${color}"/><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-size="${icon ? 22 : 38}">${icon ? 'E5' : title}</text></svg>`),
  };
}

async function saveAndReload(page: Page) {
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Save changes', exact: true }).click(),
  ]);
  await expect(page.getByRole('button', { name: 'Discard', exact: true })).toHaveCount(0);
}

function withoutUpdatedAt(row: Record<string, unknown>) {
  const copy = { ...row };
  delete copy.updated_at;
  return copy;
}

test('branding uploads persist, draft replacements can be discarded, and the student receives both themes', async ({ page, context }) => {
  test.setTimeout(90_000);
  const admin = localAdmin();
  const original = await admin.from('tenant_settings').select('*').limit(2);
  expect(original.error).toBeNull();
  expect(original.data!.length).toBeLessThanOrEqual(1);
  const originalSettings = original.data?.[0];
  const marker = randomUUID();
  const siteName = `E5 Garden ${marker.slice(0, 8)}`;
  const files = {
    light: svgFile(`e5-${marker}-light.svg`, 'Garden Light', '#0f766e'),
    dark: svgFile(`e5-${marker}-dark.svg`, 'Garden Dark', '#4338ca'),
    replacement: svgFile(`e5-${marker}-replacement.svg`, 'Garden Renewed', '#0369a1'),
    favicon: svgFile(`e5-${marker}-favicon.svg`, 'Garden Icon', '#0f766e', true),
  };
  const ownedNames = new Set(Object.values(files).map(file => file.name));
  const uploadedPaths = new Set<string>();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() !== 'PUT' || url.origin !== localApi || !url.pathname.startsWith(uploadPrefix)) return;
    const path = decodeURIComponent(url.pathname.slice(uploadPrefix.length));
    const basename = path.slice('branding/'.length);
    if (path.startsWith('branding/') && [...ownedNames].some(name => /^\d+-/.test(basename) && basename.endsWith(`-${name}`))) {
      uploadedPaths.add(path);
    }
  });

  async function upload(label: string, file: ReturnType<typeof svgFile>) {
    await page.getByLabel(t('adminOperations.shared.imageUpload.file', { label }), { exact: true }).setInputFiles(file);
    const preview = page.getByRole('img', { name: label, exact: true });
    await expect(preview).toHaveAttribute('src', new RegExp(`${file.name.replaceAll('.', '\\.')}$`));
    const source = (await preview.getAttribute('src'))!;
    const url = new URL(source);
    expect(url.origin).toBe(localApi);
    expect(url.pathname.startsWith(publicPrefix)).toBe(true);
    const path = decodeURIComponent(url.pathname.slice(publicPrefix.length));
    expect(path.startsWith('branding/')).toBe(true);
    expect(path.endsWith(`-${file.name}`)).toBe(true);
    uploadedPaths.add(path);
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    return source;
  }

  async function assertAsset(source: string, expectedTitle: string) {
    const response = await page.request.get(source);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(`<title>${expectedTitle}</title>`);
  }

  try {
    await login(page, 'admin@example.test');
    await page.goto('/admin/branding');
    await page.getByLabel('Site name', { exact: true }).fill(siteName);
    await page.getByLabel('Body font', { exact: true }).selectOption('serif');
    const primary = page.getByText('Primary', { exact: true }).locator('..').locator('input[type="text"]');
    await primary.fill('#0f766e');
    await primary.press('Tab');
    const firstLight = await upload(lightLabel, files.light);
    const dark = await upload(darkLabel, files.dark);
    const favicon = await upload('Favicon', files.favicon);
    await expect(page.getByLabel('Site name', { exact: true })).toHaveValue(siteName);
    await saveAndReload(page);
    const saved = await admin.from('tenant_settings').select('site_name,font_family,primary_color,logo_light_url,logo_dark_url,favicon_url').single();
    expect(saved.error).toBeNull();
    expect(saved.data).toEqual({ site_name: siteName, font_family: 'serif', primary_color: '#0f766e', logo_light_url: firstLight, logo_dark_url: dark, favicon_url: favicon });
    await assertAsset(firstLight, 'Garden Light');
    await assertAsset(dark, 'Garden Dark');
    await assertAsset(favicon, 'Garden Icon');

    const draft = await upload(lightLabel, files.replacement);
    expect((await admin.from('tenant_settings').select('logo_light_url').single()).data?.logo_light_url).toBe(firstLight);
    await assertAsset(firstLight, 'Garden Light');
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(page.getByRole('img', { name: lightLabel, exact: true })).toHaveAttribute('src', firstLight);
    await expect(page.getByRole('button', { name: 'Discard', exact: true })).toHaveCount(0);
    await assertAsset(firstLight, 'Garden Light');
    await assertAsset(draft, 'Garden Renewed');

    const lightUpload = page.getByLabel(t('adminOperations.shared.imageUpload.file', { label: lightLabel }), { exact: true }).locator('..');
    await lightUpload.getByRole('button', { name: t('adminOperations.shared.imageUpload.remove', { label: lightLabel }), exact: true }).click();
    await expect(page.getByRole('img', { name: lightLabel, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(page.getByRole('img', { name: lightLabel, exact: true })).toHaveAttribute('src', firstLight);
    expect((await admin.from('tenant_settings').select('logo_light_url').single()).data?.logo_light_url).toBe(firstLight);
    await assertAsset(firstLight, 'Garden Light');
    await page.screenshot({ path: test.info().outputPath('branding-admin-discard.png'), fullPage: true, animations: 'disabled' });

    const replacement = await upload(lightLabel, files.replacement);
    await saveAndReload(page);
    expect((await admin.from('tenant_settings').select('logo_light_url').single()).data?.logo_light_url).toBe(replacement);
    await assertAsset(firstLight, 'Garden Light');
    await assertAsset(replacement, 'Garden Renewed');

    await context.clearCookies();
    await login(page, 'student@example.test');
    await expect(page).toHaveTitle(siteName);
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', favicon);
    const manifestResponse = await page.request.get('/manifest.webmanifest');
    expect(manifestResponse.status()).toBe(200);
    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe(siteName);
    expect(manifest.icons.some((icon: { src: string }) => icon.src === favicon)).toBe(true);
    for (const [theme, source] of [['light', replacement], ['dark', dark]] as const) {
      await page.evaluate(value => localStorage.setItem('openmembers:theme', value), theme);
      await page.reload();
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
      else await expect(page.locator('html')).not.toHaveClass(/dark/);
      await expect(page).toHaveTitle(siteName);
      const secondaryCta = page.getByRole('link', { name: 'View catalog', exact: true });
      await expect(secondaryCta).toBeVisible();
      const expectedCtaColor = page.viewportSize()!.width < 768
        ? await page.evaluate(() => {
          const probe = document.createElement('span');
          probe.style.cssText = 'position:absolute;visibility:hidden;transition:none;color:var(--color-foreground)';
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        })
        : 'rgb(255, 255, 255)';
      await expect(secondaryCta).toHaveCSS('color', expectedCtaColor);
      const visibleLogo = page.locator(`img[src="${source}"]:visible`).first();
      await expect(visibleLogo).toBeVisible();
      await expect.poll(() => visibleLogo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      expect((await page.locator('html').evaluate(element => getComputedStyle(element).getPropertyValue('--color-primary').trim())).toLowerCase()).toBe('#0f766e');
      expect(await page.locator('body').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Georgia');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: test.info().outputPath(`branding-student-${theme}.png`), fullPage: true, animations: 'disabled' });
    }
    expect(errors).toEqual([]);
  } finally {
    if (originalSettings) {
      const restored = await admin.from('tenant_settings').upsert(originalSettings);
      expect(restored.error).toBeNull();
      const current = await admin.from('tenant_settings').select('*').eq('id', originalSettings.id).single();
      expect(current.error).toBeNull();
      expect(withoutUpdatedAt(current.data!)).toEqual(withoutUpdatedAt(originalSettings));
    } else {
      const removed = await admin.from('tenant_settings').delete().eq('site_name', siteName);
      expect(removed.error).toBeNull();
    }
    if (uploadedPaths.size > 0) {
      const removed = await admin.storage.from(bucket).remove([...uploadedPaths]);
      expect(removed.error).toBeNull();
    }
  }
});
