import { test, expect, type Page } from './fixtures/database-test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import learning from '../core/i18n/locales/en/learning.json';
import { browserTestTarget } from './fixtures/test-target.mjs';

const password = 'OpenMembers-local-2026!';
const coursePath = '/courses/open-members-demo';
const { apiOrigin: localApi, mailboxOrigin: mailbox } = browserTestTarget();

function localAdmin() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== localApi) throw new Error('Database browser tests require the guarded local runner.');
  return createClient(localApi, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function emailLink(email: string, subject: RegExp) {
  let id: string | undefined;
  await expect.poll(async () => {
    const data = await (await fetch(`${mailbox}/api/v1/messages`)).json();
    id = data.messages.find((message: { ID: string; Subject: string; To: { Address: string }[] }) =>
      subject.test(message.Subject) && message.To.some(to => to.Address === email))?.ID;
    return Boolean(id);
  }).toBe(true);
  const message = await (await fetch(`${mailbox}/api/v1/message/${id}`)).json();
  const link = String(message.HTML).match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]?.replaceAll('&amp;', '&');
  if (!link || new URL(link).origin !== localApi) throw new Error('Expected a local Auth verification link.');
  return link;
}

test('student opens released lesson, saves progress and downloads only permitted material', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page, 'student@example.test');
  await page.goto(`${coursePath}/welcome`);
  await expect(page.getByText('E2 PRIVATE LESSON BODY — available to enrolled members.', { exact: false })).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain('E2 LOCKED LESSON BODY');
  expect(html).not.toContain('E2 DRAFT LESSON BODY');
  const complete = page.getByRole('button', { name: learning.completion.mark, exact: true })
    .or(page.getByRole('button', { name: learning.completion.completed, exact: true }));
  if (await complete.getAttribute('aria-pressed') === 'true') await complete.click();
  await expect(complete).toHaveAttribute('aria-pressed', 'false');
  await complete.click();
  await expect(complete).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(complete).toHaveAttribute('aria-pressed', 'true');
  const attachment = await page.request.get('/api/attachments/60000000-0000-4000-8000-000000000001');
  expect(attachment.status()).toBe(200);
  expect(await attachment.text()).toContain('Open Members');
  expect((await page.request.get('/api/attachments/60000000-0000-4000-8000-000000000002')).status()).toBe(403);
  await page.screenshot({ path: test.info().outputPath('student-lesson.png'), fullPage: true });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(errors).toEqual([]);
});

test('visitor can read preview but cannot fetch paid lesson or private file', async ({ page }) => {
  await login(page, 'visitor@example.test');
  await page.goto(`${coursePath}/preview`);
  await expect(page.getByText('A free preview for signed-in learners.', { exact: false })).toBeVisible();
  await page.goto(`${coursePath}/welcome`);
  expect(await page.content()).not.toContain('E2 PRIVATE LESSON BODY');
  expect((await page.request.get('/api/attachments/60000000-0000-4000-8000-000000000001')).status()).toBe(403);
});

test('administrator loads seeded content and student management', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page, 'admin@example.test');
  for (const path of ['/admin', '/admin/content', '/admin/users', '/admin/branding']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('body')).not.toContainText('Application error');
  }
  await page.screenshot({ path: test.info().outputPath('administrator-branding.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('signup confirms local email and password recovery establishes a usable session', async ({ page, context }) => {
  const admin = localAdmin();
  const email = `browser-${randomUUID()}@example.test`;
  let userId: string | undefined;
  try {
    await page.goto('/register');
    await page.locator('input[name="displayName"]').fill('Browser Demo');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    const profile = await admin.from('profiles').select('id,role').eq('email', email).single();
    expect(profile.error).toBeNull();
    userId = profile.data?.id;
    expect(profile.data?.role).toBe('user');
    await page.goto(await emailLink(email, /confirm/i));
    await expect(page).toHaveURL(/\/dashboard$/);
    await context.clearCookies();
    await page.goto('/forgot-password');
    await page.locator('input[name="email"]').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('If an account exists with that address, you will receive a link to set a new password.', { exact: true })).toBeVisible();
    await page.goto(await emailLink(email, /reset/i));
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.locator('input[name="password"]').fill(`${password}Reset`);
    await page.locator('input[name="confirmPassword"]').fill(`${password}Reset`);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const client = createClient(localApi, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.auth.signInWithPassword({ email, password: `${password}Reset` })).error).toBeNull();
    expect((await client.auth.signInWithPassword({ email, password })).error).not.toBeNull();
  } finally {
    if (!userId) userId = (await admin.from('profiles').select('id').eq('email', email).maybeSingle()).data?.id;
    if (userId) expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
  }
});

test('administrator saves a new identity and a student receives that identity', async ({ page, context }) => {
  const admin = localAdmin();
  const original = await admin.from('tenant_settings').select('*').limit(1).maybeSingle();
  expect(original.error).toBeNull();
  const siteName = 'E3 Botanical School';
  try {
    await login(page, 'admin@example.test');
    await page.goto('/admin/branding');
    await page.getByLabel('Site name', { exact: true }).fill(siteName);
    await page.getByLabel('Body font', { exact: true }).selectOption('serif');
    await page.getByRole('button', { name: /Save changes/i }).click();
    await expect.poll(async () => (await admin.from('tenant_settings').select('site_name').limit(1).single()).data?.site_name).toBe(siteName);
    await expect(page).toHaveTitle(siteName);
    await page.screenshot({ path: test.info().outputPath('saved-administrator-brand.png'), fullPage: true });
    await context.clearCookies();
    await login(page, 'student@example.test');
    await expect(page).toHaveTitle(siteName);
    await expect(page.getByRole('link', { name: siteName, exact: true }).first()).toBeVisible();
    expect((await (await page.request.get('/manifest.webmanifest')).json()).name).toBe(siteName);
  } finally {
    if (original.data) {
      expect((await admin.from('tenant_settings').upsert(original.data)).error).toBeNull();
    } else {
      expect((await admin.from('tenant_settings').delete().eq('site_name', siteName)).error).toBeNull();
    }
  }
});
