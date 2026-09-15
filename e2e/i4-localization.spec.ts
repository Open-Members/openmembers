import { test, expect, type Page } from './fixtures/database-test';
import type { Download } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTranslator } from 'next-intl';
import { randomUUID } from 'node:crypto';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFRawStream,
} from 'pdf-lib';
import en from '../core/i18n/locales/en';
import pt from '../core/i18n/locales/pt';
import es from '../core/i18n/locales/es';
import { EMAIL_TEMPLATE_DEFAULTS } from '../lib/services/email/templates/localization';
import { browserTestTarget } from './fixtures/test-target.mjs';

const catalogs = { en, pt, es };
const locales = ['en', 'pt', 'es'] as const;
type Locale = (typeof locales)[number];
const target = browserTestTarget();
const dayMs = 86_400_000;
const expirationTemplate = 'expiration_warning_7d';
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};

function localAdmin(baseURL: string | undefined, requireJobSecret = false) {
  if (
    target.name !== 'pilot'
    || process.env.OPENMEMBERS_BROWSER_TEST_TARGET !== 'pilot'
    || process.env.OPENMEMBERS_LOCAL_BROWSER_TEST !== '1'
    || baseURL !== target.appOrigin
    || process.env.NEXT_PUBLIC_SITE_URL !== target.appOrigin
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== target.apiOrigin
    || process.env.EMAIL_TRANSPORT !== 'mailpit'
    || process.env.MAILPIT_URL !== target.mailboxOrigin
    || !process.env.SUPABASE_SERVICE_ROLE_KEY
    || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || (requireJobSecret && !/^[a-f0-9]{64}$/u.test(process.env.CRON_SECRET ?? ''))
  ) {
    throw new Error('I4 localization tests require the guarded local pilot runner.');
  }
  return createClient(
    target.apiOrigin,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    clientOptions,
  );
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function downloadBytes(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The certificate download stream is unavailable.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function renderedPdfText(bytes: Buffer) {
  const document = await PDFDocument.load(bytes);
  return document.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? contents.asArray().map(reference => document.context.lookup(reference))
      : [contents];
    return streams.map((stream) => {
      if (!(stream instanceof PDFRawStream)) {
        throw new Error('Expected a generated certificate content stream.');
      }
      const operators = Buffer.from(
        decodePDFRawStream(stream).decode(),
      ).toString('latin1');
      return [...operators.matchAll(/<([0-9a-f]+)>/giu)]
        .map(match => Buffer.from(match[1], 'hex').toString('latin1'))
        .join('\n');
    }).join('\n');
  }).join('\n');
}

async function cleanupOperation(
  errors: string[],
  label: string,
  operation: () => PromiseLike<{ error: unknown }>,
) {
  try {
    if ((await operation()).error) errors.push(label);
  } catch {
    errors.push(label);
  }
}

function fillEmailTemplate(
  template: string,
  values: Record<string, string>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function noticeCopy(locale: Locale, courseTitle: string) {
  const content = catalogs[locale].notifications.automatic.content.dripCourse;
  return {
    title: content.title.replace('{courseTitle}', courseTitle),
    message: content.message.replace('{courseTitle}', courseTitle),
  };
}

for (const locale of locales) {
  test(`${locale}: account locale controls transactional quiz, persisted notices, and certificate PDF`, async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(240_000);
    const service = localAdmin(baseURL);
    const copy = catalogs[locale];
    const t = createTranslator({ locale, messages: copy });
    const token = randomUUID();
    const ids = {
      tenant: randomUUID(),
      course: randomUUID(),
      module: randomUUID(),
      lesson: randomUUID(),
      quiz: randomUUID(),
      question: randomUUID(),
      correct: randomUUID(),
      incorrect: randomUUID(),
      level: randomUUID(),
      descriptorNotice: randomUUID(),
      literalNotice: randomUUID(),
    };
    const slug = `i4-localization-${token}`;
    const email = `i4-${locale}-${token}@example.test`;
    const password = `I4-${randomUUID()}-aA9!`;
    const studentName = `I4 Authored Student ${locale.toUpperCase()}`;
    const courseTitle = `I4 Authored Course ${token}`;
    const literalTitle = `I4 literal title ${token}`;
    const literalMessage = `I4 literal message ${token}`;
    const englishSnapshot = noticeCopy('en', courseTitle);
    let userId: string | undefined;
    const browserErrors: string[] = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });

    try {
      const settings = await service.from('tenant_settings')
        .select('id').limit(1).maybeSingle();
      expect(settings.error).toBeNull();
      expect(settings.data, 'The I4 pilot must not overwrite installation settings.').toBeNull();
      expect((await service.from('tenant_settings').insert({
        id: ids.tenant,
        site_name: `I4 Installation ${token}`,
        certificate_enabled: true,
        certificate_title: null,
        certificate_body: null,
        certificate_footer: null,
      })).error).toBeNull();

      const created = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: studentName },
      });
      expect(created.error).toBeNull();
      userId = created.data.user?.id;
      expect(userId).toBeTruthy();
      expect((await service.from('profiles').update({
        display_name: studentName,
        preferred_locale: locale,
      }).eq('id', userId!)).error).toBeNull();

      expect((await service.from('courses').insert({
        id: ids.course,
        slug,
        title: courseTitle,
        description: `I4 authored description ${token}`,
        content_format: 'video',
        is_published: true,
        certificate_enabled: true,
      })).error).toBeNull();
      expect((await service.from('modules').insert({
        id: ids.module,
        course_id: ids.course,
        title: `I4 authored module ${token}`,
        is_published: true,
      })).error).toBeNull();
      expect((await service.from('lessons').insert({
        id: ids.lesson,
        module_id: ids.module,
        slug: 'quiz',
        title: `I4 authored quiz ${token}`,
        content_type: 'quiz',
        is_published: true,
      })).error).toBeNull();
      expect((await service.from('quizzes').insert({
        id: ids.quiz,
        lesson_id: ids.lesson,
        intro: `I4 authored quiz introduction ${token}`,
        pass_threshold_percent: 100,
        max_attempts: 1,
        show_correct_answers: true,
      })).error).toBeNull();
      expect((await service.from('quiz_questions').insert({
        id: ids.question,
        quiz_id: ids.quiz,
        type: 'single_choice',
        prompt: `I4 authored question ${token}?`,
        explanation: `I4 authored explanation ${token}.`,
      })).error).toBeNull();
      expect((await service.from('quiz_options').insert([
        {
          id: ids.correct,
          question_id: ids.question,
          text: `I4 authored correct answer ${token}`,
          is_correct: true,
          sort_order: 0,
        },
        {
          id: ids.incorrect,
          question_id: ids.question,
          text: `I4 authored incorrect answer ${token}`,
          is_correct: false,
          sort_order: 1,
        },
      ])).error).toBeNull();
      expect((await service.from('access_levels').insert({
        id: ids.level,
        slug,
        name: `I4 authored access ${token}`,
      })).error).toBeNull();
      expect((await service.from('access_level_courses').insert({
        access_level_id: ids.level,
        course_id: ids.course,
      })).error).toBeNull();
      expect((await service.from('enrollments').insert({
        user_id: userId!,
        access_level_id: ids.level,
        source: 'i4_browser_fixture',
        is_active: true,
      })).error).toBeNull();
      expect((await service.from('notifications').insert([
        {
          id: ids.descriptorNotice,
          user_id: userId!,
          type: 'drip_unlock',
          title: englishSnapshot.title,
          message: englishSnapshot.message,
          message_key: 'content.dripCourse',
          message_params: { courseTitle },
          action_url: `/courses/${slug}`,
          is_read: false,
        },
        {
          id: ids.literalNotice,
          user_id: userId!,
          type: 'announcement',
          title: literalTitle,
          message: literalMessage,
          message_key: null,
          message_params: null,
          is_read: false,
        },
      ])).error).toBeNull();

      // Browser and visitor preference are English; the account must win.
      await context.addCookies([{
        name: 'NEXT_LOCALE',
        value: 'en',
        url: target.appOrigin,
      }]);
      await signIn(page, email, password);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);

      await page.goto(`/courses/${slug}/quiz`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByText(
        t('learning.quiz.questions', { count: 1 }),
        { exact: true },
      )).toBeVisible();
      await page.getByRole('button', {
        name: copy.learning.quiz.start,
        exact: true,
      }).click();
      await page.getByRole('radio', {
        name: `I4 authored correct answer ${token}`,
        exact: true,
      }).check();
      await page.getByRole('button', {
        name: copy.learning.quiz.submit,
        exact: true,
      }).click();
      await expect(page.getByRole('heading', {
        name: copy.learning.quiz.passed,
        exact: true,
      })).toBeVisible();
      await expect(page.getByText(
        `I4 authored explanation ${token}.`,
        { exact: true },
      )).toBeVisible();

      const attempts = await service.from('quiz_attempts')
        .select('id,passed,score_percent,answers')
        .eq('user_id', userId!)
        .eq('quiz_id', ids.quiz);
      expect(attempts.error).toBeNull();
      expect(attempts.data).toHaveLength(1);
      expect(attempts.data?.[0]).toMatchObject({
        id: expect.any(String),
        passed: true,
        score_percent: 100,
        answers: { [ids.question]: ids.correct },
      });
      const progress = await service.from('lesson_progress')
        .select('is_completed,completed_at')
        .eq('user_id', userId!)
        .eq('lesson_id', ids.lesson)
        .maybeSingle();
      expect(progress.error).toBeNull();
      expect(progress.data).toMatchObject({
        is_completed: true,
        completed_at: expect.any(String),
      });

      await page.goto('/notifications');
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const localizedNotice = noticeCopy(locale, courseTitle);
      await expect(page.getByText(localizedNotice.title, { exact: true })).toBeVisible();
      await expect(page.getByText(localizedNotice.message, { exact: true })).toBeVisible();
      await expect(page.getByText(literalTitle, { exact: true })).toBeVisible();
      await expect(page.getByText(literalMessage, { exact: true })).toBeVisible();
      if (locale !== 'en') {
        await expect(page.getByText(englishSnapshot.message, { exact: true })).toHaveCount(0);
      }
      const persistedNotices = await service.from('notifications')
        .select('id,title,message,message_key,message_params')
        .in('id', [ids.descriptorNotice, ids.literalNotice]);
      expect(persistedNotices.error).toBeNull();
      expect(persistedNotices.data?.find(row => row.id === ids.descriptorNotice))
        .toEqual({
          id: ids.descriptorNotice,
          title: englishSnapshot.title,
          message: englishSnapshot.message,
          message_key: 'content.dripCourse',
          message_params: { courseTitle },
        });
      expect(persistedNotices.data?.find(row => row.id === ids.literalNotice))
        .toEqual({
          id: ids.literalNotice,
          title: literalTitle,
          message: literalMessage,
          message_key: null,
          message_params: null,
        });
      await page.screenshot({
        path: testInfo.outputPath(`notifications-${locale}.png`),
        fullPage: true,
        animations: 'disabled',
      });

      await page.goto(`/courses/${slug}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', {
        name: courseTitle,
        exact: true,
      })).toBeVisible();
      const certificateButton = page.getByRole('button', {
        name: copy.certificates.download.label,
        exact: true,
      });
      await expect(certificateButton).toBeVisible();
      const certificateDownload = page.waitForEvent('download');
      await certificateButton.click();
      const download = await certificateDownload;
      expect(await download.failure()).toBeNull();
      const expectedSlug = courseTitle.toLowerCase().replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '');
      expect(download.suggestedFilename()).toBe(
        `${copy.certificates.download.fileNamePrefix}-${expectedSlug}.pdf`,
      );
      const pdfBytes = await downloadBytes(download);
      expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      const pdfText = await renderedPdfText(pdfBytes);
      const certificateCopy = copy.certificates.pdf;
      for (const text of [
        certificateCopy.defaultTitle,
        certificateCopy.intro,
        certificateCopy.completion,
        certificateCopy.dateLabel,
        studentName,
        courseTitle,
      ]) {
        expect(pdfText).toContain(text);
      }
      const certificate = await service.from('certificates')
        .select('verification_code,issued_at')
        .eq('user_id', userId!)
        .eq('course_id', ids.course)
        .maybeSingle();
      expect(certificate.error).toBeNull();
      expect(certificate.data).toMatchObject({
        verification_code: expect.stringMatching(/^[A-F0-9]{16}$/u),
        issued_at: expect.any(String),
      });
      expect(pdfText).toContain(certificateCopy.verificationCode.replace(
        '{code}',
        certificate.data!.verification_code,
      ));
      await download.saveAs(testInfo.outputPath(`certificate-${locale}.pdf`));
      expect(browserErrors).toEqual([]);
    } finally {
      await page.goto('about:blank').catch(() => undefined);
      const cleanupErrors: string[] = [];
      if (!userId) {
        try {
          const found = await service.from('profiles').select('id')
            .eq('email', email).maybeSingle();
          if (found.error) cleanupErrors.push('I4 profile lookup failed');
          userId = found.data?.id;
        } catch {
          cleanupErrors.push('I4 profile lookup failed');
        }
      }
      if (userId) {
        await cleanupOperation(cleanupErrors, 'I4 enrollment cleanup failed', () =>
          service.from('enrollments').delete()
            .eq('user_id', userId!).eq('access_level_id', ids.level));
        await cleanupOperation(cleanupErrors, 'I4 account cleanup failed', () =>
          service.auth.admin.deleteUser(userId!));
      }
      await cleanupOperation(cleanupErrors, 'I4 course cleanup failed', () =>
        service.from('courses').delete().eq('id', ids.course));
      await cleanupOperation(cleanupErrors, 'I4 access cleanup failed', () =>
        service.from('access_levels').delete().eq('id', ids.level));
      await cleanupOperation(cleanupErrors, 'I4 settings cleanup failed', () =>
        service.from('tenant_settings').delete().eq('id', ids.tenant));
      expect(cleanupErrors).toEqual([]);
    }
  });
}

test('expiration job sends Mailpit defaults in each recipient account locale', async ({
  baseURL,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'One job invocation already covers all three recipient locales.',
  );
  test.setTimeout(240_000);
  const service = localAdmin(baseURL, true);
  const token = randomUUID();
  const courseId = randomUUID();
  const levelId = randomUUID();
  const courseTitle = `I4 Authored Renewal ${token}`;
  const slug = `i4-renewal-${token}`;
  const expiresAt = new Date(Date.now() + 6.75 * dayMs).toISOString();
  const fixtures = locales.map(locale => ({
    locale,
    email: `i4-mail-${locale}-${token}@example.test`,
    password: `I4-Mail-${randomUUID()}-aA9!`,
    name: `I4 Mail Student ${locale.toUpperCase()}`,
    enrollmentId: randomUUID(),
    userId: undefined as string | undefined,
  }));
  const providerIds = new Set<string>();

  try {
    const override = await service.from('email_templates')
      .select('template_key')
      .eq('template_key', expirationTemplate)
      .maybeSingle();
    expect(override.error).toBeNull();
    expect(
      override.data,
      'The I4 default-copy proof refuses an authored global email override.',
    ).toBeNull();

    expect((await service.from('courses').insert({
      id: courseId,
      slug,
      title: courseTitle,
      is_published: true,
      checkout_url: null,
    })).error).toBeNull();
    expect((await service.from('access_levels').insert({
      id: levelId,
      slug,
      name: `I4 renewal access ${token}`,
    })).error).toBeNull();
    expect((await service.from('access_level_courses').insert({
      access_level_id: levelId,
      course_id: courseId,
    })).error).toBeNull();

    for (const fixture of fixtures) {
      const created = await service.auth.admin.createUser({
        email: fixture.email,
        password: fixture.password,
        email_confirm: true,
        user_metadata: { display_name: fixture.name },
      });
      expect(created.error).toBeNull();
      fixture.userId = created.data.user?.id;
      expect(fixture.userId).toBeTruthy();
      expect((await service.from('profiles').update({
        display_name: fixture.name,
        preferred_locale: fixture.locale,
      }).eq('id', fixture.userId!)).error).toBeNull();
      expect((await service.from('enrollments').insert({
        id: fixture.enrollmentId,
        user_id: fixture.userId!,
        access_level_id: levelId,
        source: 'i4_email_fixture',
        expires_at: expiresAt,
        is_active: true,
      })).error).toBeNull();
    }

    const preflightNow = Date.now();
    const qualifying = await service.from('enrollments')
      .select('id')
      .eq('is_active', true)
      .gte('expires_at', new Date(preflightNow + 5.9 * dayMs).toISOString())
      .lt('expires_at', new Date(preflightNow + 7.1 * dayMs).toISOString())
      .order('id');
    expect(qualifying.error).toBeNull();
    expect(
      qualifying.data?.map(row => row.id).sort(),
      'The global job must not encounter a non-I4 enrollment in its time window.',
    ).toEqual(fixtures.map(fixture => fixture.enrollmentId).sort());

    const jobResponse = await fetch(
      `${target.appOrigin}/api/cron/${expirationTemplate}`,
      {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(120_000),
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          accept: 'application/json',
        },
      },
    );
    expect(jobResponse.status).toBe(200);
    expect(jobResponse.headers.get('content-type')?.split(';')[0]).toBe(
      'application/json',
    );
    const job = await jobResponse.json();
    expect(job).toMatchObject({
      sent: 3,
      skipped: 0,
      failed: 0,
      total: 3,
    });

    let sends: Array<{
      user_id: string;
      campaign_key: string | null;
      status: string;
      provider_message_id: string | null;
      metadata: Record<string, unknown>;
    }> = [];
    await expect.poll(async () => {
      const result = await service.from('email_sends')
        .select('user_id,campaign_key,status,provider_message_id,metadata')
        .in('user_id', fixtures.map(fixture => fixture.userId!))
        .eq('template_key', expirationTemplate);
      expect(result.error).toBeNull();
      sends = result.data ?? [];
      return sends.length;
    }, { timeout: 15_000 }).toBe(3);
    expect(new Set(sends.map(send => send.provider_message_id)).size).toBe(3);

    for (const fixture of fixtures) {
      const send = sends.find(row => row.user_id === fixture.userId);
      expect(send).toMatchObject({
        user_id: fixture.userId,
        campaign_key: expirationTemplate,
        status: 'sent',
        provider_message_id: expect.any(String),
        metadata: {
          enrollmentId: fixture.enrollmentId,
          accessLevelId: levelId,
          expiresAt,
          locale: fixture.locale,
          localeSource: 'profile',
          transport: 'mailpit',
        },
      });
      const messageId = send!.provider_message_id!;
      providerIds.add(messageId);
      const response = await fetch(
        `${target.mailboxOrigin}/api/v1/message/${encodeURIComponent(messageId)}`,
        { redirect: 'error', signal: AbortSignal.timeout(10_000) },
      );
      expect(response.ok).toBe(true);
      const message = await response.json() as {
        Subject: string;
        HTML: string;
        Text: string;
        To: Array<{ Address: string }>;
      };
      expect(message.To.some(recipient => recipient.Address === fixture.email)).toBe(true);
      const defaults = EMAIL_TEMPLATE_DEFAULTS.expiration_warning_7d[fixture.locale];
      expect(message.Subject).toBe(fillEmailTemplate(defaults.subject, {
        courseTitle,
        daysUntilExpiration: '7',
      }));
      expect(message.HTML).toContain(courseTitle);
      expect(message.HTML).toContain(defaults.ctaLabel);
      expect(message.Text).toContain(courseTitle);
      expect(message.Text).toContain(defaults.ctaLabel);
    }
  } finally {
    const cleanupErrors: string[] = [];
    try {
      const response = await fetch(`${target.mailboxOrigin}/api/v1/messages`, {
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        cleanupErrors.push('I4 mailbox inventory failed');
      } else {
        const data = await response.json() as {
          messages?: Array<{
            ID: string;
            To?: Array<{ Address: string }>;
          }>;
        };
        const ownEmails = new Set(fixtures.map(fixture => fixture.email));
        for (const message of data.messages ?? []) {
          if (message.To?.some(recipient => ownEmails.has(recipient.Address))) {
            providerIds.add(message.ID);
          }
        }
      }
    } catch {
      cleanupErrors.push('I4 mailbox inventory failed');
    }
    if (providerIds.size > 0) {
      try {
        const response = await fetch(`${target.mailboxOrigin}/api/v1/messages`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ IDs: [...providerIds] }),
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) cleanupErrors.push('I4 mailbox cleanup failed');
      } catch {
        cleanupErrors.push('I4 mailbox cleanup failed');
      }
    }
    for (const fixture of fixtures) {
      await cleanupOperation(cleanupErrors, 'I4 email enrollment cleanup failed', () =>
        service.from('enrollments').delete().eq('id', fixture.enrollmentId));
      if (!fixture.userId) {
        try {
          const found = await service.from('profiles').select('id')
            .eq('email', fixture.email).maybeSingle();
          if (found.error) cleanupErrors.push('I4 email profile lookup failed');
          fixture.userId = found.data?.id;
        } catch {
          cleanupErrors.push('I4 email profile lookup failed');
        }
      }
      if (fixture.userId) {
        await cleanupOperation(cleanupErrors, 'I4 email account cleanup failed', () =>
          service.auth.admin.deleteUser(fixture.userId!));
      }
    }
    await cleanupOperation(cleanupErrors, 'I4 email course cleanup failed', () =>
      service.from('courses').delete().eq('id', courseId));
    await cleanupOperation(cleanupErrors, 'I4 email access cleanup failed', () =>
      service.from('access_levels').delete().eq('id', levelId));
    expect(cleanupErrors).toEqual([]);
  }
});
