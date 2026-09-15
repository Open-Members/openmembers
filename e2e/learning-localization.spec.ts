import { test, expect, type Page } from './fixtures/database-test';
import { createClient } from '@supabase/supabase-js';
import { createTranslator } from 'next-intl';
import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import en from '../core/i18n/locales/en';
import pt from '../core/i18n/locales/pt';
import es from '../core/i18n/locales/es';
import { browserTestTarget } from './fixtures/test-target.mjs';

const catalogs = { en, pt, es };
const { appOrigin, apiOrigin } = browserTestTarget();
const escapedAppOrigin = appOrigin.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function localAdmin(baseURL: string | undefined) {
  if (baseURL !== appOrigin || process.env.NEXT_PUBLIC_SUPABASE_URL !== apiOrigin
    || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Learning localization tests require the isolated local preview and Supabase.');
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

// Each run owns its complete data graph, including the account. No demo-user
// preferences, enrollments, authored content or existing progress are mutated.
for (const locale of ['en', 'pt', 'es'] as const) {
  test(`${locale}: profile language covers the learning journey and PDF reader`, async ({ page, context, baseURL, isMobile }, testInfo) => {
    test.setTimeout(180_000);
    const service = localAdmin(baseURL);
    const copy = catalogs[locale];
    const t = createTranslator({ locale, messages: copy });
    const token = randomUUID();
    const email = `learning-i2b-${token}@example.test`;
    const password = `Learning-${randomUUID()}-aA9!`;
    const courseId = randomUUID();
    const libraryId = randomUUID();
    const moduleId = randomUUID();
    const libraryModuleId = randomUUID();
    const lessonId = randomUUID();
    const quizLessonId = randomUUID();
    const videoLessonId = randomUUID();
    const pdfLessonId = randomUUID();
    const emptyLessonId = randomUUID();
    const quizId = randomUUID();
    const questionId = randomUUID();
    const correctId = randomUUID();
    const levelId = randomUUID();
    const slug = `learning-i2b-${token}`;
    const librarySlug = `${slug}-library`;
    const pdfPath = `lessons/${pdfLessonId}/${token}.pdf`;
    const fileName = 'Authored English workbook.pdf';
    let userId: string | undefined;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Learning Fixture' } });
      expect(created.error).toBeNull();
      userId = created.data.user?.id;
      expect(userId).toBeTruthy();
      expect((await service.from('profiles').update({ preferred_locale: locale }).eq('id', userId!)).error).toBeNull();
      expect((await service.from('courses').insert([
        { id: courseId, slug, title: 'Authored English course', description: 'Authored course description', is_published: true, is_free: false, content_format: 'video', duration_minutes: 90 },
        { id: libraryId, slug: librarySlug, title: 'Authored English library', is_published: true, is_free: false, content_format: 'ebook' },
      ])).error).toBeNull();
      expect((await service.from('modules').insert([
        { id: moduleId, course_id: courseId, title: 'Authored English module', is_published: true },
        { id: libraryModuleId, course_id: libraryId, title: 'Authored library module', is_published: true },
      ])).error).toBeNull();
      expect((await service.from('lessons').insert([
        { id: lessonId, module_id: moduleId, slug: 'text', title: 'Authored text lesson', content_type: 'text', text_content: 'Authored English learning content.', description: 'Authored lesson description', duration_seconds: 120, sort_order: 0, is_published: true },
        { id: quizLessonId, module_id: moduleId, slug: 'quiz', title: 'Authored quiz lesson', content_type: 'quiz', sort_order: 1, is_published: true },
        { id: videoLessonId, module_id: moduleId, slug: 'video', title: 'Authored video lesson', content_type: 'video', sort_order: 2, is_published: true },
        { id: pdfLessonId, module_id: libraryModuleId, slug: 'pdf', title: 'Authored PDF lesson', content_type: 'text', ebook_cover_url: '/icon.svg', sort_order: 0, is_published: true },
        { id: emptyLessonId, module_id: libraryModuleId, slug: 'empty', title: 'Authored empty lesson', content_type: 'text', ebook_cover_url: '/icon.svg', sort_order: 1, is_published: true },
      ])).error).toBeNull();
      expect((await service.from('quizzes').insert({ id: quizId, lesson_id: quizLessonId, intro: 'Authored quiz introduction', pass_threshold_percent: 70, max_attempts: 2, show_correct_answers: true })).error).toBeNull();
      expect((await service.from('quiz_questions').insert({ id: questionId, quiz_id: quizId, type: 'single_choice', prompt: 'Authored English question?', explanation: 'Authored explanation.' })).error).toBeNull();
      expect((await service.from('quiz_options').insert([
        { id: correctId, question_id: questionId, text: 'Authored correct answer', is_correct: true, sort_order: 0 },
        { id: randomUUID(), question_id: questionId, text: 'Authored incorrect answer', is_correct: false, sort_order: 1 },
      ])).error).toBeNull();
      expect((await service.from('access_levels').insert({ id: levelId, slug, name: 'Learning I2b fixture' })).error).toBeNull();
      expect((await service.from('access_level_courses').insert([courseId, libraryId].map(course_id => ({ access_level_id: levelId, course_id })))).error).toBeNull();
      expect((await service.from('enrollments').insert({ user_id: userId!, access_level_id: levelId, source: 'manual', is_active: true })).error).toBeNull();
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      pdf.addPage().drawText('Authored English PDF content.', { x: 50, y: 700, font, size: 14 });
      const bytes = Buffer.from(await pdf.save());
      expect((await service.storage.from('lesson-materials').upload(pdfPath, bytes, { contentType: 'application/pdf' })).error).toBeNull();
      expect((await service.from('lesson_attachments').insert([pdfLessonId, lessonId].map(lesson_id => ({ lesson_id, file_name: fileName, file_url: pdfPath, file_type: 'application/pdf', file_size_bytes: bytes.length })))).error).toBeNull();

      // Browser and visitor preference disagree with PT/ES: the profile wins.
      await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: appOrigin }]);
      await signIn(page, email, password);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByText(t('learningOverview.dashboard.greeting', { name: 'Learning Fixture' }), { exact: true }).nth(isMobile ? 1 : 0)).toBeVisible();
      await page.goto('/courses');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.learningOverview.catalog.title);
      await expect(page.getByRole('heading', { name: 'Authored English course', exact: true }).first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`catalog-${locale}.png`), fullPage: true, animations: 'disabled' });

      await page.goto(`/courses/${slug}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Authored English course');
      await expect(page.getByText(copy.learning.course.about, { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: copy.learning.course.start, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: t('learning.course.summary', { lessons: 3, modules: 1 }), exact: true })).toBeVisible();
      await page.goto(`/courses/${slug}/text`);
      await expect(page.getByText('Authored English learning content.', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: copy.learning.extras.aboutLesson, exact: true })).toBeVisible();
      const rating = page.getByRole('radiogroup', { name: copy.learning.rating.label });
      await rating.getByRole('radio', { name: t('learning.rating.stars', { count: 5 }), exact: true }).click();
      await expect(page.getByText(copy.learning.rating.saved, { exact: true })).toBeVisible();
      await expect.poll(async () => (await service.from('lesson_ratings').select('stars').eq('user_id', userId!).eq('lesson_id', lessonId).single()).data?.stars).toBe(5);
      await page.getByRole('button', { name: copy.learning.rating.remove, exact: true }).click();
      await expect.poll(async () => {
        const result = await service.from('lesson_ratings').select('lesson_id', { count: 'exact', head: true }).eq('user_id', userId!).eq('lesson_id', lessonId);
        expect(result.error).toBeNull();
        return result.count;
      }).toBe(0);
      const materialDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: t('learning.extras.download', { fileName }), exact: true }).click();
      const material = await materialDownload;
      expect(material.suggestedFilename()).toBe(fileName);
      expect(await material.failure()).toBeNull();
      await page.getByRole('button', { name: copy.learning.completion.mark, exact: true }).click();
      await expect(page.getByRole('button', { name: copy.learning.completion.completed, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await service.from('lesson_progress').select('is_completed').eq('user_id', userId!).eq('lesson_id', lessonId).single()).data?.is_completed).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`lesson-${locale}.png`), fullPage: true, animations: 'disabled' });

      await page.goto(`/courses/${slug}/quiz`);
      await expect(page.getByText(t('learning.quiz.questions', { count: 1 }), { exact: true })).toBeVisible();
      await expect(page.getByText(t('learning.quiz.threshold', { percent: 0.7 }), { exact: true })).toBeVisible();
      await page.getByRole('button', { name: copy.learning.quiz.start, exact: true }).click();
      await expect(page.getByRole('button', { name: copy.learning.quiz.submit, exact: true })).toBeDisabled();
      await page.getByRole('radio', { name: 'Authored correct answer', exact: true }).check();
      await page.getByRole('button', { name: copy.learning.quiz.submit, exact: true }).click();
      await expect(page.getByRole('heading', { name: copy.learning.quiz.passed, exact: true })).toBeVisible();
      await expect(page.getByText('Authored explanation.', { exact: true })).toBeVisible();
      const attempt = await service.from('quiz_attempts').select('passed,score_percent').eq('user_id', userId!).eq('quiz_id', quizId).single();
      expect(attempt.error).toBeNull();
      expect(attempt.data).toEqual({ passed: true, score_percent: 100 });
      await page.screenshot({ path: testInfo.outputPath(`quiz-${locale}.png`), fullPage: true, animations: 'disabled' });
      await page.goto(`/courses/${slug}/video`);
      await expect(page.getByText(copy.learning.lesson.empty, { exact: true })).toBeVisible();

      await page.goto(`/courses/${librarySlug}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Authored English library');
      await expect(page.getByText(t('learningMedia.library.ebooks', { count: 2 }), { exact: true })).toBeVisible();
      await page.goto(`/courses/${librarySlug}/pdf`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Authored PDF lesson');
      if (isMobile) {
        await expect(page.getByText(copy.learningMedia.reader.mobileHelp, { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: copy.learningMedia.reader.downloadPdf, exact: true })).toBeVisible();
      } else {
        await expect(page.locator('iframe[title="Authored PDF lesson"]')).toHaveAttribute('src', new RegExp(`^blob:${escapedAppOrigin}/`, 'u'));
      }
      const pdfDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: copy.learningMedia.reader.download, exact: true }).click();
      expect((await pdfDownload).suggestedFilename()).toBe(fileName);
      await page.getByRole('button', { name: copy.learningMedia.reader.markRead, exact: true }).click();
      await expect(page.getByRole('button', { name: copy.learningMedia.reader.read, exact: true })).toBeDisabled();
      expect((await service.from('lesson_progress').select('is_completed').eq('user_id', userId!).eq('lesson_id', pdfLessonId).single()).data?.is_completed).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`reader-${locale}.png`), fullPage: true, animations: 'disabled' });
      await page.goto(`/courses/${librarySlug}/empty`);
      await expect(page.getByText(copy.learningMedia.reader.noPdf, { exact: true })).toBeVisible();
      await page.goto('/progress');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.learningOverview.progress.title);
      await expect(page.getByRole('heading', { name: copy.learningOverview.activity.title, exact: true })).toBeVisible();
      await expect(page.getByText(t('learningOverview.activity.summary', { lessons: 3, days: 1 }), { exact: true })).toBeVisible();
      await expect(page.getByText(copy.learningOverview.stats.overall, { exact: true })).toBeVisible();
      // Motion animates numbers in JS; screenshot's animations option only
      // settles CSS animations. Wait for the actual persisted totals as well.
      await expect(page.getByText(copy.learningOverview.stats.lessonsDone, { exact: true }).locator('..').getByText('3', { exact: true })).toBeVisible();
      await expect(page.getByText(copy.learningOverview.stats.overall, { exact: true }).locator('..').getByText(new Intl.NumberFormat(locale, { style: 'percent' }).format(0.6), { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`progress-${locale}.png`), fullPage: true, animations: 'disabled' });
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      expect(errors).toEqual([]);
    } finally {
      await page.goto('about:blank');
      expect((await service.storage.from('lesson-materials').remove([pdfPath])).error).toBeNull();
      expect((await service.from('courses').delete().in('id', [courseId, libraryId])).error).toBeNull();
      expect((await service.from('enrollments').delete().eq('access_level_id', levelId)).error).toBeNull();
      expect((await service.from('access_levels').delete().eq('id', levelId)).error).toBeNull();
      if (userId) expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  });
}
