import { test, expect, type Page } from './fixtures/database-test';
import { createClient } from '@supabase/supabase-js';
import { createTranslator } from 'next-intl';
import { randomUUID } from 'node:crypto';
import en from '../core/i18n/locales/en';
import pt from '../core/i18n/locales/pt';
import es from '../core/i18n/locales/es';
import { browserTestTarget } from './fixtures/test-target.mjs';

const catalogs = { en, pt, es };
const { appOrigin, apiOrigin } = browserTestTarget();

function localAdmin(baseURL: string | undefined) {
  if (baseURL !== appOrigin || process.env.NEXT_PUBLIC_SUPABASE_URL !== apiOrigin
    || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Tools localization tests require the isolated local preview and Supabase.');
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

// The fixture owns every row it changes. No existing demo account, preference,
// course, live event or notification is updated or deleted by this suite.
for (const locale of ['en', 'pt', 'es'] as const) {
  test(`${locale}: profile language covers search, comments, live sessions and notifications`, async ({ page, context, baseURL, isMobile }, testInfo) => {
    test.setTimeout(150_000);
    const service = localAdmin(baseURL);
    const copy = catalogs[locale];
    const t = createTranslator({ locale, messages: copy });
    const token = randomUUID();
    const email = `tools-i2c-${token}@example.test`;
    const password = `Tools-${randomUUID()}-aA9!`;
    const courseId = randomUUID();
    const moduleId = randomUUID();
    const lessonId = randomUUID();
    const levelId = randomUUID();
    const eventId = randomUUID();
    const noticeId = randomUUID();
    const earlierId = randomUUID();
    const slug = `tools-i2c-${token}`;
    const searchToken = `Tools ${token.slice(0, 8)}`;
    const courseTitle = `${searchToken} authored course`;
    const lessonTitle = `${searchToken} authored lesson`;
    const meetingUrl = 'https://meet.example.test/fixture';
    let userId: string | undefined;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Tools Fixture' } });
      expect(created.error).toBeNull();
      userId = created.data.user?.id;
      expect(userId).toBeTruthy();
      expect((await service.from('profiles').update({ preferred_locale: locale }).eq('id', userId!)).error).toBeNull();
      expect((await service.from('courses').insert({ id: courseId, slug, title: courseTitle, description: 'Authored description', is_published: true, is_free: false, content_format: 'video' })).error).toBeNull();
      expect((await service.from('modules').insert({ id: moduleId, course_id: courseId, title: 'Authored module', is_published: true })).error).toBeNull();
      expect((await service.from('lessons').insert({ id: lessonId, module_id: moduleId, slug: 'discussion', title: lessonTitle, content_type: 'text', text_content: 'Authored English lesson body.', is_published: true })).error).toBeNull();
      expect((await service.from('access_levels').insert({ id: levelId, slug, name: 'Tools I2c fixture' })).error).toBeNull();
      expect((await service.from('access_level_courses').insert({ access_level_id: levelId, course_id: courseId })).error).toBeNull();
      expect((await service.from('enrollments').insert({ user_id: userId!, access_level_id: levelId, source: 'manual', is_active: true })).error).toBeNull();
      expect((await service.from('live_classes').insert({ id: eventId, title: 'Authored live session', description: 'Authored live description', starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(), duration_minutes: 60, meeting_url: meetingUrl, origin_timezone: 'Europe/London' })).error).toBeNull();
      expect((await service.from('live_class_courses').insert({ live_class_id: eventId, course_id: courseId })).error).toBeNull();
      expect((await service.from('notifications').insert([
        { id: noticeId, user_id: userId!, type: 'announcement', title: 'Authored notice title', message: 'Authored notice body', is_read: false, created_at: new Date().toISOString() },
        { id: earlierId, user_id: userId!, type: 'new_lesson', title: 'Authored earlier notice', message: 'Authored earlier body', is_read: false, created_at: new Date(Date.now() - 2 * 86400_000).toISOString() },
      ])).error).toBeNull();

      // Browser + visitor cookie are English. Profile preference must prevail.
      await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: appOrigin }]);
      await signIn(page, email, password);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByText(copy.liveClasses.upcomingClass, { exact: true })).toBeVisible();
      await expect(page.getByText('Authored live session', { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`live-card-${locale}.png`), fullPage: true, animations: 'disabled' });

      await page.getByRole('button', { name: copy.navigation.search, exact: true }).click();
      const search = page.getByRole('dialog', { name: copy.search.title, exact: true });
      await expect(search.getByText(copy.search.minimum, { exact: true })).toBeVisible();
      await search.getByRole('textbox', { name: copy.search.input }).fill(searchToken);
      await expect(search.getByRole('button', { name: new RegExp(lessonTitle) })).toBeVisible();
      await expect(search.getByText(copy.search.lessons, { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`search-${locale}.png`), animations: 'disabled' });
      await search.getByRole('button', { name: new RegExp(lessonTitle) }).click();
      await expect(page).toHaveURL(new RegExp(`/courses/${slug}/discussion$`));
      const comments = page.locator('#lesson-comments');
      await expect(comments.getByText(copy.comments.emptyTitle, { exact: true })).toBeVisible();
      await comments.getByRole('textbox', { name: copy.comments.commentLabel }).fill('Authored English comment');
      await comments.getByRole('button', { name: copy.comments.submit, exact: true }).click();
      await expect(comments.getByText('Authored English comment', { exact: true })).toBeVisible();
      await expect(page.locator('#lesson-comments-title')).toHaveText(t('comments.titleWithCount', { count: 1 }));
      await comments.getByRole('button', { name: copy.comments.reply, exact: true }).click();
      await comments.getByRole('textbox', { name: copy.comments.replyLabel }).fill('Authored English reply');
      await comments.getByRole('button', { name: copy.comments.reply, exact: true }).last().click();
      // Wait for the rendered reply, not the identical draft still in textarea.
      await expect(comments.locator('p').filter({ hasText: /^Authored English reply$/ })).toBeVisible();
      await expect(comments.getByRole('textbox', { name: copy.comments.replyLabel })).toHaveCount(0);
      await expect.poll(async () => {
        const stored = await service.from('lesson_comments').select('id').eq('lesson_id', lessonId);
        expect(stored.error).toBeNull();
        return stored.data?.length;
      }).toBe(2);
      // The heading counts top-level discussions; replies remain nested.
      await expect(page.locator('#lesson-comments-title')).toHaveText(t('comments.titleWithCount', { count: 1 }));
      await page.screenshot({ path: testInfo.outputPath(`comments-${locale}.png`), fullPage: true, animations: 'disabled' });
      await comments.getByRole('button', { name: copy.comments.delete, exact: true }).first().click();
      await expect(comments.getByText(copy.comments.emptyTitle, { exact: true })).toBeVisible();
      expect((await service.from('lesson_comments').select('id').eq('lesson_id', lessonId)).data).toEqual([]);

      await page.goto('/progress');
      await expect(page.getByRole('heading', { name: copy.liveClasses.upcoming, exact: true })).toBeVisible();
      const meeting = page.getByRole('link').filter({ has: page.getByRole('heading', { name: 'Authored live session', exact: true }) });
      await expect(meeting).toHaveAttribute('href', meetingUrl);
      await expect(meeting).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(page.getByRole('link', { name: copy.liveClasses.viewCourse, exact: true })).toHaveAttribute('href', `/courses/${slug}`);
      expect(await page.locator('a a').count()).toBe(0);
      await page.screenshot({ path: testInfo.outputPath(`live-strip-${locale}.png`), fullPage: true, animations: 'disabled' });

      await page.goto('/notifications');
      await expect(page.getByRole('heading', { name: copy.notifications.title, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: copy.notifications.today, exact: true })).toBeVisible();
      await expect(page.getByText('Authored notice body', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: new RegExp(`^${copy.notifications.filters.new_lesson}`) }).click();
      await expect(page.getByText('Authored earlier body', { exact: true })).toBeVisible();
      await expect(page.getByText('Authored notice body', { exact: true })).not.toBeVisible();
      await page.getByRole('button', { name: new RegExp(`^${copy.notifications.filters.all}`) }).click();
      await page.screenshot({ path: testInfo.outputPath(`notifications-${locale}.png`), fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: copy.notifications.markAll, exact: true }).click();
      await expect(page.getByRole('button', { name: copy.notifications.markAll, exact: true })).not.toBeVisible();
      expect((await service.from('notifications').select('is_read').eq('user_id', userId!)).data).toEqual([{ is_read: true }, { is_read: true }]);

      await page.getByRole('button', { name: copy.notifications.title, exact: true }).click();
      const panel = page.getByRole('dialog', { name: copy.notifications.title, exact: true });
      await expect(panel.getByText('Authored notice body', { exact: true })).toBeVisible();
      const bounds = await panel.boundingBox();
      expect(bounds).toBeTruthy();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({ path: testInfo.outputPath(`notification-bell-${locale}.png`), animations: 'disabled' });
      await panel.getByRole('button', { name: copy.notifications.close, exact: true }).click();
      await page.getByRole('button', { name: copy.notifications.delete, exact: true }).first().click();
      await expect(page.getByText('Authored notice body', { exact: true })).not.toBeVisible();
      await page.getByRole('button', { name: copy.notifications.delete, exact: true }).click();
      await expect(page.getByText(copy.notifications.emptyTitle, { exact: true })).toBeVisible();
      expect((await service.from('notifications').select('id').eq('user_id', userId!)).data).toEqual([]);

      const chat = await context.request.post('/api/course-chat', { data: { courseId, message: 'Fixture' } });
      expect(chat.status()).toBe(503);
      expect((await chat.json()).error).toBe('not_configured');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await page.goto('about:blank');
      expect((await service.from('live_classes').delete().eq('id', eventId)).error).toBeNull();
      expect((await service.from('courses').delete().eq('id', courseId)).error).toBeNull();
      expect((await service.from('enrollments').delete().eq('access_level_id', levelId)).error).toBeNull();
      expect((await service.from('access_levels').delete().eq('id', levelId)).error).toBeNull();
      if (userId) expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  });
}
