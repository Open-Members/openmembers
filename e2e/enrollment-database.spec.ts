import { test, expect, type Page } from './fixtures/database-test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { browserTestTarget } from './fixtures/test-target.mjs';

const {
  appOrigin,
  apiOrigin: localApi,
  mailboxOrigin: mailbox,
} = browserTestTarget();
const demoPassword = 'OpenMembers-local-2026!';
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

function localClients() {
  if (process.env.OPENMEMBERS_LOCAL_BROWSER_TEST !== '1'
    || process.env.NEXT_PUBLIC_SITE_URL !== appOrigin
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== localApi
    || process.env.EMAIL_TRANSPORT !== 'mailpit'
    || process.env.MAILPIT_URL !== mailbox
    || !process.env.SUPABASE_SERVICE_ROLE_KEY
    || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Enrollment browser tests require the guarded local runner and Mailpit.');
  }
  return {
    admin: createClient(localApi, process.env.SUPABASE_SERVICE_ROLE_KEY, clientOptions),
    learner: createClient(localApi, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, clientOptions),
  };
}

async function login(page: Page, email: string, password: string, initial = false) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(initial ? /\/change-password$/ : /\/dashboard$/);
}

async function userRow(page: Page, email: string) {
  await page.goto('/admin/users');
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  await page.getByPlaceholder('Search by name or email...').fill(email);
  await page.getByRole('button', { name: 'Search', exact: true }).click({ timeout: 10_000 });
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toHaveCount(1);
  return row;
}

test('manual invitation requires a new password and respects role changes and enrollment deactivation', async ({ page, context }) => {
  test.setTimeout(180_000);
  const { admin, learner } = localClients();
  const suffix = randomUUID();
  const email = `enrollment-browser-${suffix}@example.test`;
  const name = `E5 learner ${suffix}`;
  const slug = `e5-enrollment-${suffix}`;
  const own = { course: randomUUID(), module: randomUUID(), lesson: randomUUID(), draft: randomUUID(), level: randomUUID(), cohort: randomUUID() };
  const body = `E5 own paid content ${suffix}`;
  const draftBody = `E5 own unpublished content ${suffix}`;
  const password = `E5-local-${randomUUID()}!`;
  const lessonPath = `/courses/${slug}/paid`;
  let userId: string | undefined;
  let enrollmentId = '';

  async function profile() {
    const result = await admin.from('profiles').select('id,role,status,must_change_password').eq('email', email).maybeSingle();
    expect(result.error).toBeNull();
    userId = result.data?.id ?? userId;
    return result.data;
  }
  async function visibleLessons() {
    const result = await learner.from('lessons').select('id').in('id', [own.lesson, own.draft]).order('id');
    expect(result.error).toBeNull();
    return result.data?.map(lesson => lesson.id);
  }
  async function activeAccess() {
    const result = await learner.rpc('can_access_lesson', { p_lesson_id: own.lesson });
    expect(result.error).toBeNull();
    return result.data;
  }

  try {
    expect((await admin.from('courses').insert({ id: own.course, slug, title: `E5 enrollment ${suffix}`, is_published: true })).error).toBeNull();
    expect((await admin.from('modules').insert({ id: own.module, course_id: own.course, title: 'Own enrollment module', is_published: true })).error).toBeNull();
    expect((await admin.from('lessons').insert([
      { id: own.lesson, module_id: own.module, title: 'Own paid lesson', slug: 'paid', content_type: 'text', text_content: body, is_published: true },
      { id: own.draft, module_id: own.module, title: 'Own unpublished lesson', slug: 'draft', content_type: 'text', text_content: draftBody, is_published: false },
    ])).error).toBeNull();
    expect((await admin.from('access_levels').insert({ id: own.level, name: `E5 product ${suffix}`, slug })).error).toBeNull();
    expect((await admin.from('access_level_courses').insert({ access_level_id: own.level, course_id: own.course })).error).toBeNull();
    expect((await admin.from('cohorts').insert({ id: own.cohort, course_id: own.course, name: 'Own enrollment cohort', slug: 'own' })).error).toBeNull();

    await login(page, 'admin@example.test', demoPassword);
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Add student', exact: true }).click();
    const invite = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add student', exact: true }) });
    await invite.getByPlaceholder('Jane Doe').fill(name);
    await invite.getByPlaceholder('jane@example.com').fill(email);
    await invite.locator('label').filter({ hasText: 'Access level * (product)' }).getByRole('combobox').selectOption(own.level);
    await invite.locator('label').filter({ hasText: 'Cohort (optional)' }).getByRole('combobox').selectOption(own.cohort);
    await expect(invite.getByRole('checkbox', { name: /Send welcome email/ })).toBeChecked();
    await invite.getByRole('button', { name: 'Add student', exact: true }).click();
    await expect(invite).toHaveCount(0);
    await expect.poll(profile).toMatchObject({ id: expect.any(String), role: 'user', status: 'active', must_change_password: true });
    await expect.poll(async () => {
      const result = await admin.from('enrollments').select('id,is_active,expires_at,source').eq('user_id', userId!).eq('access_level_id', own.level).maybeSingle();
      expect(result.error).toBeNull();
      enrollmentId = result.data?.id ?? '';
      return result.data;
    }).toMatchObject({ id: expect.any(String), is_active: true, expires_at: null, source: 'manual_admin_add' });
    const cohorts = await admin.from('enrollment_cohorts').select('course_id,cohort_id').eq('enrollment_id', enrollmentId);
    expect(cohorts.error).toBeNull();
    expect(cohorts.data).toEqual([{ course_id: own.course, cohort_id: own.cohort }]);

    // The audit ties this message to this invitation, without relying on inbox ordering.
    let messageId = '';
    await expect.poll(async () => {
      const sent = await admin.from('email_sends').select('provider_message_id,metadata').eq('user_id', userId!).eq('template_key', 'welcome_with_password').eq('status', 'sent').maybeSingle();
      expect(sent.error).toBeNull();
      messageId = sent.data?.provider_message_id ?? '';
      return Boolean(messageId && sent.data?.metadata?.transport === 'mailpit');
    }).toBe(true);
    const mailResponse = await fetch(`${mailbox}/api/v1/message/${encodeURIComponent(messageId)}`, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    expect(mailResponse.ok).toBe(true);
    const message = await mailResponse.json();
    expect(message.To?.some((recipient: { Address: string }) => recipient.Address === email)).toBe(true);
    const temporaryPassword = String(message.HTML).match(/<p\b[^>]*>Temporary password<\/p>\s*<p\b[^>]*>([A-Za-z0-9]+)<\/p>/)?.[1];
    if (!temporaryPassword) throw new Error('The own Mailpit invitation has no temporary password.');

    await context.clearCookies();
    await login(page, email, temporaryPassword, true);
    await expect(page.getByRole('heading', { name: 'Welcome.', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to my courses', exact: true })).toBeVisible();
    await page.goto(lessonPath);
    await expect(page).toHaveURL(/\/change-password$/);
    expect(await page.content()).not.toContain(body);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="confirmPassword"]').fill(password);
    await page.getByRole('button', { name: 'Continue to my courses', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect.poll(profile).toMatchObject({ must_change_password: false });
    await page.goto(lessonPath);
    await expect(page.getByText(body, { exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(draftBody);
    await page.screenshot({ path: test.info().outputPath('invited-learner-access.png'), fullPage: true });

    expect((await learner.auth.signInWithPassword({ email, password })).error).toBeNull();
    expect(await activeAccess()).toBe(true);
    expect(await visibleLessons()).toEqual([own.lesson]);
    const selfPromotion = await learner.from('profiles').update({ role: 'admin' }).eq('id', userId!);
    expect(selfPromotion.error?.code).toBe('42501');
    expect((await profile())?.role).toBe('user');
    const oldPassword = createClient(localApi, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, clientOptions);
    expect((await oldPassword.auth.signInWithPassword({ email, password: temporaryPassword })).error).not.toBeNull();

    await context.clearCookies();
    await login(page, 'admin@example.test', demoPassword);
    let row = await userRow(page, email);
    await row.getByRole('combobox').selectOption('admin');
    await expect.poll(profile).toMatchObject({ role: 'admin' });
    // Reuse the learner JWT: authorization must reflect the current database role.
    await expect.poll(visibleLessons).toEqual([own.lesson, own.draft].sort());
    await context.clearCookies();
    await login(page, email, password);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator('body')).not.toContainText('Application error');

    await context.clearCookies();
    await login(page, 'admin@example.test', demoPassword);
    row = await userRow(page, email);
    await row.getByRole('combobox').selectOption('user');
    await expect.poll(profile).toMatchObject({ role: 'user' });
    await expect.poll(visibleLessons).toEqual([own.lesson]);
    await row.getByTitle('Manage enrollments', { exact: true }).click();
    const enrollments = page.getByRole('dialog', { name: `Manage enrollments — ${name}`, exact: true });
    await expect(enrollments.getByText('Own enrollment cohort', { exact: true })).toBeVisible();
    await enrollments.getByRole('button', { name: 'Deactivate', exact: true }).click();
    await expect.poll(async () => {
      const result = await admin.from('enrollments').select('is_active').eq('id', enrollmentId).single();
      expect(result.error).toBeNull();
      return result.data?.is_active;
    }).toBe(false);
    await expect(enrollments.getByRole('button', { name: 'Reactivate', exact: true })).toBeVisible();
    await expect.poll(activeAccess).toBe(false);
    expect(await visibleLessons()).toEqual([]);
    await context.clearCookies();
    await login(page, email, password);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/dashboard$/);
    const denied = await page.goto(lessonPath);
    expect(denied?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(`${appOrigin}${lessonPath}`);
    await expect(page.getByText('Error 404', { exact: true })).toBeVisible();
    expect(await page.content()).not.toContain(body);
    expect(await page.content()).not.toContain(draftBody);
    await page.screenshot({ path: test.info().outputPath('deactivated-learner-access.png'), fullPage: true });
  } finally {
    // Run every cleanup even after a partial invitation; never use a shared fixture filter.
    const cleanupErrors: string[] = [];
    if (!userId) {
      const found = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
      if (found.error) cleanupErrors.push('Own profile lookup failed');
      userId = found.data?.id;
    }
    if (userId && (await admin.auth.admin.deleteUser(userId)).error) cleanupErrors.push('Own Auth user deletion failed');
    if ((await admin.from('access_levels').delete().eq('id', own.level)).error) cleanupErrors.push('Own product deletion failed');
    if ((await admin.from('courses').delete().eq('id', own.course)).error) cleanupErrors.push('Own course deletion failed');
    expect(cleanupErrors).toEqual([]);
  }
});
