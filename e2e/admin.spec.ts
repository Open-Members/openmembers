import { test, expect } from './fixtures/database-test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import adminContent from '../core/i18n/locales/en/adminContent.json';
import { browserTestTarget } from './fixtures/test-target.mjs';

const { apiOrigin: localApi } = browserTestTarget();

test('administrator creates, orders, publishes and removes fictitious course content', async ({ page, context }) => {
  test.setTimeout(120_000);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== localApi) throw new Error('Use the guarded local database runner.');
  const admin = createClient(localApi, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = randomUUID();
  const slug = `e5-admin-${suffix}`;
  const title = `E5 Admin ${suffix}`;
  let courseId: string | undefined;
  async function login(email: string) {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill('OpenMembers-local-2026!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  try {
    await login('admin@example.test');
    await page.goto('/admin/content');
    await page.getByRole('button', { name: 'Create course', exact: true }).click();
    await page.getByPlaceholder('e.g. Getting Started with Marketing').fill(title);
    await page.getByPlaceholder(adminContent.autoSlug, { exact: true }).fill(slug);
    await page.locator('form').getByRole('button', { name: 'Create course', exact: true }).click();
    await expect.poll(async () => {
      const result = await admin.from('courses').select('id').eq('slug', slug).maybeSingle();
      expect(result.error).toBeNull();
      courseId = result.data?.id;
      return Boolean(courseId);
    }).toBe(true);
    await page.goto(`/admin/content/${slug}`);
    await page.getByRole('button', { name: 'Add module', exact: true }).click();
    await page.getByPlaceholder('e.g. Getting started').fill('E5 module');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'E5 module', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit module', exact: true }).click();
    await page.getByRole('checkbox', { name: /Published/ }).check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    for (const [lessonTitle, lessonSlug] of [['E5 first lesson', 'first'], ['E5 second lesson', 'second']]) {
      await page.getByRole('button', { name: 'Add lesson', exact: true }).click();
      await page.getByPlaceholder('e.g. Welcome to the course').fill(lessonTitle);
      await page.getByPlaceholder('welcome', { exact: true }).fill(lessonSlug);
      await page.getByRole('button', { name: 'Text', exact: true }).click();
      await page.getByPlaceholder('Lesson content…').fill(`Fictitious E5 body ${lessonSlug} ${suffix}`);
      await page.getByRole('checkbox', { name: /Published/ }).check();
      await page.getByRole('checkbox', { name: /Free preview/ }).check();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByText(lessonTitle, { exact: true })).toBeVisible();
    }
    const moduleResult = await admin.from('modules').select('id').eq('course_id', courseId!).single();
    expect(moduleResult.error).toBeNull();
    const moduleId = moduleResult.data!.id;
    await page.getByRole('button', { name: 'Move lesson up', exact: true }).nth(1).click();
    await expect.poll(async () => {
      const result = await admin.from('lessons').select('slug').eq('module_id', moduleId).order('sort_order');
      expect(result.error).toBeNull();
      return result.data?.map(row => row.slug);
    }).toEqual(['second', 'first']);
    await page.reload();
    await page.getByRole('button', { name: 'Edit lesson', exact: true }).first().click();
    await page.getByPlaceholder('Lesson content…').fill(`Edited fictitious E5 body ${suffix}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await admin.from('lessons').select('text_content').eq('module_id', moduleId).eq('slug', 'second').single()).data?.text_content).toBe(`Edited fictitious E5 body ${suffix}`);
    await page.goto('/admin/content');
    const actions = page.locator(`a[href="/admin/content/${slug}"]`).locator('..');
    await actions.getByTitle('Publish', { exact: true }).click();
    await expect.poll(async () => (await admin.from('courses').select('is_published').eq('id', courseId!).single()).data?.is_published).toBe(true);
    await context.clearCookies();
    await login('visitor@example.test');
    await page.goto(`/courses/${slug}/second`);
    await expect(page.getByText(`Edited fictitious E5 body ${suffix}`, { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('created-preview.png'), fullPage: true });
    await context.clearCookies();
    await login('admin@example.test');
    await page.goto(`/admin/content/${slug}`);
    await page.getByRole('button', { name: 'Edit module', exact: true }).click();
    await page.getByRole('button', { name: 'Delete module', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(async () => (await admin.from('lessons').select('id').eq('module_id', moduleId)).data).toEqual([]);
    await expect.poll(async () => (await admin.from('modules').select('id').eq('id', moduleId)).data).toEqual([]);
  } finally {
    // Clean only this test's UUID course, including after partial UI failure.
    if (!courseId) courseId = (await admin.from('courses').select('id').eq('slug', slug).maybeSingle()).data?.id;
    if (courseId) expect((await admin.from('courses').delete().eq('id', courseId)).error).toBeNull();
  }
});
