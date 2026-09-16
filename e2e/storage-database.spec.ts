import { test, expect, type Page } from './fixtures/database-test';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, PDFArray, PDFRawStream, StandardFonts, decodePDFRawStream } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import { createTranslator } from 'next-intl';
import en from '../core/i18n/locales/en';
import { browserTestTarget } from './fixtures/test-target.mjs';

const { apiOrigin: localApi } = browserTestTarget();
const bucket = 'lesson-materials';
const uploadPrefix = `/storage/v1/object/upload/sign/${bucket}/`;
const t = createTranslator({ locale: 'en', messages: en });
const watermarkDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
});
const demoUsers = [
  { id: '10000000-0000-4000-8000-000000000001', email: 'admin@example.test', role: 'super_admin' },
  { id: '10000000-0000-4000-8000-000000000002', email: 'student@example.test', role: 'user' },
  { id: '10000000-0000-4000-8000-000000000003', email: 'visitor@example.test', role: 'user' },
] as const;

type MaterialFile = { name: string; mimeType: string; buffer: Buffer };
type Attachment = { id: string; file_name: string; file_url: string; file_type: string; file_size_bytes: number; sort_order: number };

function localAdmin() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== localApi || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Material browser tests require the guarded local database runner.');
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

async function createPdf(marker: string) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let number = 1; number <= 2; number += 1) {
    document.addPage([612, 792]).drawText(`${marker} page ${number}`, { x: 35, y: 730, size: 10, font });
  }
  return Buffer.from(await document.save());
}

async function renderedPageText(bytes: Buffer) {
  const document = await PDFDocument.load(bytes);
  return document.getPages().map(page => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? contents.asArray().map(reference => document.context.lookup(reference))
      : [contents];
    return streams.map(stream => {
      if (!(stream instanceof PDFRawStream)) throw new Error('Expected PDF page content stream.');
      const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      // This controlled fixture and the watermark use standard WinAnsi fonts.
      return [...operators.matchAll(/<([0-9a-f]+)>/gi)]
        .map(match => Buffer.from(match[1], 'hex').toString('latin1')).join('\n');
    }).join('\n');
  });
}

test('private PDF and text uploads finalize, download with authorization, and are removed through the administrator UI', async ({ page, context }) => {
  test.setTimeout(150_000);
  const admin = localAdmin();
  for (const fixture of demoUsers) {
    const account = await admin.auth.admin.getUserById(fixture.id);
    expect(account.error).toBeNull();
    expect(account.data.user?.email).toBe(fixture.email);
    expect(account.data.user?.user_metadata.openmembers_fixture).toBe(true);
    const profile = await admin.from('profiles').select('email,role,status').eq('id', fixture.id).single();
    expect(profile.error).toBeNull();
    expect(profile.data).toEqual({ email: fixture.email, role: fixture.role, status: 'active' });
  }
  const storageBucket = await admin.storage.getBucket(bucket);
  expect(storageBucket.error).toBeNull();
  expect(storageBucket.data?.public).toBe(false);
  const studentProfile = await admin.from('profiles').select('display_name').eq('id', demoUsers[1].id).single();
  expect(studentProfile.error).toBeNull();
  expect(studentProfile.data?.display_name).toBe('Demo Student');

  const marker = randomUUID();
  const courseId = randomUUID();
  const moduleId = randomUUID();
  const lessonId = randomUUID();
  const levelId = randomUUID();
  const enrollmentId = randomUUID();
  const slug = `development-storage-${marker}`;
  const lessonPath = `/courses/${slug}/materials`;
  const storagePrefix = `lessons/${lessonId}/`;
  const privateBody = `Development private material body ${marker}`;
  const pdfMarker = `Development PDF ${marker}`;
  const files: MaterialFile[] = [
    { name: `${slug}.pdf`, mimeType: 'application/pdf', buffer: await createPdf(pdfMarker) },
    { name: `${slug}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Development private TXT ${marker}\n`) },
  ];
  const ownedNames = new Set(files.map(file => file.name));
  const uploadedPaths = new Set<string>();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  function isOwnedPath(path: string) {
    if (!path.startsWith(storagePrefix)) return false;
    const basename = path.slice(storagePrefix.length);
    return /^[0-9a-f-]{36}-/.test(basename) && !basename.includes('/')
      && [...ownedNames].some(name => basename.endsWith(`-${name}`));
  }
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() !== 'PUT' || url.origin !== localApi || !url.pathname.startsWith(uploadPrefix)) return;
    const path = decodeURIComponent(url.pathname.slice(uploadPrefix.length));
    if (isOwnedPath(path)) uploadedPaths.add(path);
  });

  async function storedAttachments() {
    const result = await admin.from('lesson_attachments')
      .select('id,file_name,file_url,file_type,file_size_bytes,sort_order').eq('lesson_id', lessonId).order('sort_order');
    expect(result.error).toBeNull();
    return (result.data ?? []) as Attachment[];
  }
  async function storedObjects() {
    const result = await admin.storage.from(bucket).list(storagePrefix.slice(0, -1), { limit: 100 });
    expect(result.error).toBeNull();
    return result.data ?? [];
  }
  async function assertOriginal(file: MaterialFile, attachment: Attachment) {
    const original = await admin.storage.from(bucket).download(attachment.file_url);
    expect(original.error).toBeNull();
    expect(Buffer.from(await original.data!.arrayBuffer())).toEqual(file.buffer);
  }
  async function openEditor() {
    await page.goto(`/admin/content/${slug}`);
    await page.getByRole('button', { name: 'Edit lesson', exact: true }).click();
    await expect(page.locator('#lesson-attach-input')).toHaveCount(1);
  }

  try {
    expect((await admin.from('courses').insert({ id: courseId, slug, title: `Development Materials ${marker}`, is_published: true, is_free: false, content_format: 'video' })).error).toBeNull();
    expect((await admin.from('modules').insert({ id: moduleId, course_id: courseId, title: 'Fictitious materials', is_published: true })).error).toBeNull();
    expect((await admin.from('lessons').insert({ id: lessonId, module_id: moduleId, slug: 'materials', title: 'Private materials', content_type: 'text', text_content: privateBody, is_published: true, is_free_preview: false })).error).toBeNull();
    expect((await admin.from('access_levels').insert({ id: levelId, slug, name: `Development Materials ${marker}` })).error).toBeNull();
    expect((await admin.from('access_level_courses').insert({ access_level_id: levelId, course_id: courseId })).error).toBeNull();
    expect((await admin.from('enrollments').insert({ id: enrollmentId, user_id: demoUsers[1].id, access_level_id: levelId, source: 'manual', is_active: true })).error).toBeNull();

    await login(page, demoUsers[0].email);
    await openEditor();
    for (const [index, file] of files.entries()) {
      await page.locator('#lesson-attach-input').setInputFiles(file);
      await expect(page.getByText(file.name, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeEnabled();
      await expect.poll(async () => (await storedAttachments()).length).toBe(index + 1);
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#lesson-attach-input')).toHaveCount(0);
    await openEditor();
    for (const file of files) await expect(page.getByText(file.name, { exact: true })).toBeVisible();
    const attachments = await storedAttachments();
    expect(attachments).toHaveLength(2);
    for (const [index, attachment] of attachments.entries()) {
      const file = files[index];
      expect(attachment).toMatchObject({ file_name: file.name, file_type: file.mimeType, file_size_bytes: file.buffer.length, sort_order: index });
      expect(isOwnedPath(attachment.file_url)).toBe(true);
      uploadedPaths.add(attachment.file_url);
      await assertOriginal(file, attachment);
    }

    await context.clearCookies();
    await login(page, demoUsers[1].email);
    await page.goto(lessonPath);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText(privateBody, { exact: true })).toBeVisible();
    for (const [index, file] of files.entries()) {
      const attachment = attachments[index];
      const downloadButton = page.locator('#lesson-materials').getByRole('button', {
        name: t('learning.extras.download', { fileName: file.name }), exact: true,
      });
      await expect(downloadButton).toBeVisible();
      const endpointRequest = page.waitForRequest(request => {
        const url = new URL(request.url());
        return request.method() === 'GET' && url.origin === new URL(page.url()).origin
          && url.pathname === `/api/attachments/${attachment.id}`;
      });
      const beforeDate = new Date();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        downloadButton.click(),
        endpointRequest,
      ]);
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename().endsWith(file.name)).toBe(true);
      const stream = await download.createReadStream();
      expect(stream).not.toBeNull();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      const downloaded = Buffer.concat(chunks);
      if (file.mimeType === 'application/pdf') {
        const pages = await renderedPageText(downloaded);
        expect(pages).toHaveLength(2);
        const dateLabels = [beforeDate, new Date()].map(date => t('certificates.watermark.downloaded', {
          date: watermarkDate.format(date),
        }));
        for (const [pageIndex, text] of pages.entries()) {
          expect(text).toContain(`${pdfMarker} page ${pageIndex + 1}`);
          expect(text).toContain('Demo Student');
          expect(text).toContain(demoUsers[1].email);
          expect(dateLabels.some(date => text.includes(date))).toBe(true);
        }
        expect(downloaded.equals(file.buffer)).toBe(false);
        await download.saveAs(test.info().outputPath('student-watermarked.pdf'));
      } else {
        expect(downloaded).toEqual(file.buffer);
      }

      const response = await page.request.get(`/api/attachments/${attachment.id}`, { maxRedirects: 0 });
      expect(response.headers()['cache-control']).toBe('private, no-store');
      if (file.mimeType === 'application/pdf') {
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toBe('application/pdf');
        expect(response.headers()['content-disposition']).toBe(`attachment; filename="${file.name}"`);
      } else {
        expect(response.status()).toBe(302);
        const signed = new URL(response.headers().location);
        // Do not emit a signed URL or token in an assertion failure.
        expect(signed.origin === localApi).toBe(true);
        expect(decodeURIComponent(signed.pathname) === `/storage/v1/object/sign/${bucket}/${attachment.file_url}`).toBe(true);
        const tokenPayload = signed.searchParams.get('token')?.split('.')[1];
        if (!tokenPayload) throw new Error('Expected a signed local material URL.');
        const expiresIn = JSON.parse(Buffer.from(tokenPayload, 'base64url').toString()).exp - Date.now() / 1000;
        expect(expiresIn).toBeGreaterThan(240);
        expect(expiresIn).toBeLessThanOrEqual(301);
      }
      await assertOriginal(file, attachment);
    }
    await page.locator('#lesson-materials').screenshot({ path: test.info().outputPath('student-materials.png'), animations: 'disabled' });

    await context.clearCookies();
    await login(page, demoUsers[2].email);
    await page.goto(lessonPath);
    expect(await page.content()).not.toContain(privateBody);
    for (const attachment of attachments) {
      const denied = await page.request.get(`/api/attachments/${attachment.id}`, { maxRedirects: 0 });
      expect(denied.status()).toBe(403);
      expect(denied.headers().location).toBeUndefined();
      expect(await denied.json()).toEqual({ error: 'access_denied' });
    }

    await context.clearCookies();
    await login(page, demoUsers[0].email);
    await openEditor();
    for (const attachment of attachments) {
      const row = page.getByText(attachment.file_name, { exact: true }).locator('../..');
      await row.getByRole('button', { name: 'Delete material', exact: true }).click();
      await expect(page.getByText(attachment.file_name, { exact: true })).toHaveCount(0);
      await expect.poll(async () => (await storedAttachments()).some(stored => stored.id === attachment.id)).toBe(false);
      await expect.poll(async () => (await storedObjects()).some(object => `${storagePrefix}${object.name}` === attachment.file_url)).toBe(false);
      expect((await page.request.get(`/api/attachments/${attachment.id}`, { maxRedirects: 0 })).status()).toBe(404);
    }
    expect(await storedAttachments()).toEqual([]);
    expect(await storedObjects()).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    const cleanupErrors: string[] = [];
    async function cleanup(label: string, action: () => Promise<void>) {
      try { await action(); } catch { cleanupErrors.push(label); }
    }
    await cleanup('owned material objects', async () => {
      const remaining = await storedObjects();
      for (const object of remaining) {
        const path = `${storagePrefix}${object.name}`;
        if (!isOwnedPath(path)) throw new Error('Unexpected object in the owned fixture prefix.');
        uploadedPaths.add(path);
      }
      if (uploadedPaths.size) expect((await admin.storage.from(bucket).remove([...uploadedPaths])).error).toBeNull();
      expect(await storedObjects()).toEqual([]);
    });
    await cleanup('owned enrollment', async () => {
      expect((await admin.from('enrollments').delete().eq('id', enrollmentId).eq('user_id', demoUsers[1].id).eq('access_level_id', levelId)).error).toBeNull();
      const remaining = await admin.from('enrollments').select('id').eq('id', enrollmentId);
      expect(remaining.error).toBeNull();
      expect(remaining.data).toEqual([]);
    });
    await cleanup('owned course and dependent rows', async () => {
      expect((await admin.from('courses').delete().eq('id', courseId).eq('slug', slug)).error).toBeNull();
      const remaining = await admin.from('courses').select('id').eq('id', courseId);
      expect(remaining.error).toBeNull();
      expect(remaining.data).toEqual([]);
      expect(await storedAttachments()).toEqual([]);
    });
    await cleanup('owned access level', async () => {
      expect((await admin.from('access_levels').delete().eq('id', levelId).eq('slug', slug)).error).toBeNull();
      const remaining = await admin.from('access_levels').select('id').eq('id', levelId);
      expect(remaining.error).toBeNull();
      expect(remaining.data).toEqual([]);
    });
    expect(cleanupErrors, 'Fixture cleanup must finish without touching shared demo data.').toEqual([]);
  }
});
