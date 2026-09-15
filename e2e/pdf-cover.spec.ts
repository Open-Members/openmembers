import { test, expect, type Page } from './fixtures/database-test';
import { createClient } from '@supabase/supabase-js';
import { createTranslator } from 'next-intl';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import en from '../core/i18n/locales/en';
import pt from '../core/i18n/locales/pt';
import es from '../core/i18n/locales/es';
import { assertBrowserTestEnvironment } from './fixtures/test-target.mjs';

const catalogs = { en, pt, es };
const appOrigin = 'http://localhost:3201';
const apiOrigin = 'http://127.0.0.1:56431';
const adminId = '10000000-0000-4000-8000-000000000001';
const materialBucket = 'lesson-materials';
const coverBucket = 'platform-assets';
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function localAdmin(baseURL: string | undefined, outputDir: string) {
  const target = assertBrowserTestEnvironment(process.env, baseURL);
  const privateOutput = `${path.resolve('.private/e6-local-pilot')}${path.sep}`;
  if (
    target.name !== 'pilot'
    || process.env.OPENMEMBERS_BROWSER_TEST_TARGET !== 'pilot'
    || process.env.OPENMEMBERS_PILOT_I4 !== '1'
    || target.appOrigin !== appOrigin
    || target.apiOrigin !== apiOrigin
    || !path.resolve(outputDir).startsWith(privateOutput)
  ) {
    throw new Error('PDF cover tests require the guarded I4 pilot and private output directory.');
  }
  return createClient(apiOrigin, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createPdf(marker: string) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage([600, 800]);
  for (const [x, y, color] of [
    [0, 400, rgb(1, 0, 0)],
    [300, 400, rgb(0, 0, 1)],
    [0, 0, rgb(0, 1, 0)],
    [300, 0, rgb(1, 1, 0)],
  ] as const) {
    first.drawRectangle({ x, y, width: 300, height: 400, color });
  }
  first.drawText(`Fictitious PDF ${marker}`, { x: 20, y: 760, font, size: 12 });
  // A distinct second page makes selecting the wrong page observable.
  document.addPage([600, 800]).drawRectangle({
    x: 0, y: 0, width: 600, height: 800, color: rgb(1, 0, 1),
  });
  return Buffer.from(await document.save());
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill('admin@example.test');
  await page.locator('input[name="password"]').fill('OpenMembers-local-2026!');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(`${appOrigin}/dashboard`);
}

test('administrator PDF upload persists the original and renders the first page as a PNG cover', async ({
  page, baseURL,
}, testInfo) => {
  const service = localAdmin(baseURL, testInfo.outputDir);
  const ids = { course: randomUUID(), module: randomUUID(), lesson: randomUUID() };
  const slug = `pdf-cover-${ids.course}`;
  const fileName = `${slug}.pdf`;
  const pdfBytes = await createPdf(ids.course);
  const materialPrefix = `lessons/${ids.lesson}/`;
  const coverPrefix = `ebook-covers/auto/${ids.lesson}/`;
  const ownedUploads = {
    [materialBucket]: new Set<string>(),
    [coverBucket]: new Set<string>(),
  };
  let courseCreated = false;
  let renderingFailed = false;
  page.on('pageerror', () => { renderingFailed = true; });
  page.on('console', message => {
    if (message.text().includes('[ebook-cover] auto-generation failed')) renderingFailed = true;
  });

  function ownsMaterial(objectPath: string) {
    if (!objectPath.startsWith(materialPrefix)) return false;
    const name = objectPath.slice(materialPrefix.length);
    return /^[0-9a-f-]{36}-/u.test(name) && !name.includes('/') && name.endsWith(`-${fileName}`);
  }
  function ownsCover(objectPath: string) {
    if (!objectPath.startsWith(coverPrefix)) return false;
    return new RegExp(`^\\d+-${ids.lesson}\\.png$`, 'u').test(objectPath.slice(coverPrefix.length));
  }
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() !== 'PUT' || url.origin !== apiOrigin) return;
    for (const [bucket, owns] of [
      [materialBucket, ownsMaterial], [coverBucket, ownsCover],
    ] as const) {
      const prefix = `/storage/v1/object/upload/sign/${bucket}/`;
      if (!url.pathname.startsWith(prefix)) continue;
      const objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
      if (owns(objectPath)) ownedUploads[bucket].add(objectPath);
    }
  });

  async function lesson() {
    const result = await service.from('lessons')
      .select('id,module_id,ebook_cover_url').eq('id', ids.lesson).eq('module_id', ids.module).single();
    expect(result.error).toBeNull();
    return result.data!;
  }

  try {
    const account = await service.auth.admin.getUserById(adminId);
    expect(account.error).toBeNull();
    expect(account.data.user?.email).toBe('admin@example.test');
    expect(account.data.user?.user_metadata.openmembers_fixture).toBe(true);
    const profile = await service.from('profiles').select('email,role,status').eq('id', adminId).single();
    expect(profile.error).toBeNull();
    expect(profile.data).toEqual({ email: 'admin@example.test', role: 'super_admin', status: 'active' });

    const inserted = await service.from('courses').insert({
      id: ids.course, slug, title: `Fictitious PDF cover ${ids.course}`,
      content_format: 'ebook', is_published: false, is_free: false,
    });
    expect(inserted.error).toBeNull();
    courseCreated = true;
    expect((await service.from('modules').insert({
      id: ids.module, course_id: ids.course, title: `Fictitious module ${ids.module}`, is_published: false,
    })).error).toBeNull();
    expect((await service.from('lessons').insert({
      id: ids.lesson, module_id: ids.module, slug: 'fictitious-pdf',
      title: `Fictitious PDF lesson ${ids.lesson}`, content_type: 'text',
      is_published: false, ebook_cover_url: null,
    })).error).toBeNull();

    await login(page);
    const locale = await page.locator('html').getAttribute('lang');
    if (locale !== 'en' && locale !== 'pt' && locale !== 'es') {
      throw new Error('The pilot administrator must use a supported locale.');
    }
    const t = createTranslator({ locale, messages: catalogs[locale] });
    async function openEditor() {
      await page.goto(`/admin/content/${slug}`);
      await page.getByRole('button', { name: t('adminContent.editLesson'), exact: true }).click();
      await expect(page.locator('#lesson-attach-input')).toHaveAttribute('accept', '.pdf');
    }
    await openEditor();
    await page.locator('#lesson-attach-input').setInputFiles({
      name: fileName, mimeType: 'application/pdf', buffer: pdfBytes,
    });
    await expect(page.getByText(fileName, { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: t('adminContent.chooseFile'), exact: true }))
      .toBeEnabled({ timeout: 60_000 });
    const cover = page.getByRole('img', { name: t('adminContent.coverImageOptional'), exact: true });
    await expect(cover).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => cover.evaluate(image => ({
      width: (image as HTMLImageElement).naturalWidth,
      height: (image as HTMLImageElement).naturalHeight,
    }))).toEqual({ width: 750, height: 1000 });
    await page.getByRole('button', { name: t('adminContent.save'), exact: true }).click();
    await expect(page.locator('#lesson-attach-input')).toHaveCount(0);

    const saved = await lesson();
    expect(typeof saved.ebook_cover_url === 'string' && saved.ebook_cover_url.length > 0).toBe(true);
    const publicUrl = new URL(saved.ebook_cover_url);
    const publicPrefix = `/storage/v1/object/public/${coverBucket}/`;
    expect(publicUrl.origin === apiOrigin && !publicUrl.search && !publicUrl.hash).toBe(true);
    expect(publicUrl.pathname.startsWith(publicPrefix)).toBe(true);
    const coverPath = decodeURIComponent(publicUrl.pathname.slice(publicPrefix.length));
    expect(ownsCover(coverPath)).toBe(true);
    ownedUploads[coverBucket].add(coverPath);

    const attachments = await service.from('lesson_attachments')
      .select('file_name,file_url,file_type,file_size_bytes').eq('lesson_id', ids.lesson);
    expect(attachments.error).toBeNull();
    expect(attachments.data).toHaveLength(1);
    const attachment = attachments.data![0];
    expect(attachment).toMatchObject({
      file_name: fileName, file_type: 'application/pdf', file_size_bytes: pdfBytes.length,
    });
    expect(ownsMaterial(attachment.file_url)).toBe(true);
    ownedUploads[materialBucket].add(attachment.file_url);
    const original = await service.storage.from(materialBucket).download(attachment.file_url);
    expect(original.error).toBeNull();
    expect(Buffer.from(await original.data!.arrayBuffer())).toEqual(pdfBytes);
    expect((await PDFDocument.load(pdfBytes)).getPageCount()).toBe(2);

    const imageResponse = await page.request.get(publicUrl.toString(), { maxRedirects: 0 });
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()['content-type']).toContain('image/png');
    const png = await imageResponse.body();
    expect(png.subarray(0, 8)).toEqual(pngSignature);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width: 750, height: 1000 });
    const storedCover = await service.storage.from(coverBucket).download(coverPath);
    expect(storedCover.error).toBeNull();
    expect(Buffer.from(await storedCover.data!.arrayBuffer())).toEqual(png);
    const pixels = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is required to inspect the generated cover.');
      context.drawImage(image, 0, 0);
      return [[187, 250], [562, 250], [187, 750], [562, 750]].map(([x, y]) =>
        [...context.getImageData(x, y, 1, 1).data]);
    }, png.toString('base64'));
    expect(pixels).toEqual([
      [255, 0, 0, 255], [0, 0, 255, 255], [0, 255, 0, 255], [255, 255, 0, 255],
    ]);

    await openEditor();
    await expect(page.getByText(fileName, { exact: true })).toBeVisible();
    await expect(cover).toHaveAttribute('src', saved.ebook_cover_url);
    await expect.poll(() => cover.evaluate(image => (image as HTMLImageElement).naturalHeight)).toBe(1000);
    await cover.screenshot({ path: testInfo.outputPath('pdf-cover-preview.png'), animations: 'disabled' });
    await page.screenshot({ path: testInfo.outputPath('pdf-cover-admin.png'), animations: 'disabled' });
    await writeFile(testInfo.outputPath('fictitious-original.pdf'), pdfBytes);
    await writeFile(testInfo.outputPath('generated-cover.png'), png);
    expect(renderingFailed, 'The browser must render the PDF without a cover fallback or uncaught error.').toBe(false);
  } finally {
    const cleanupErrors: string[] = [];
    async function cleanup(label: string, operation: () => Promise<void>) {
      try { await operation(); } catch { cleanupErrors.push(label); }
    }
    // Stop this test's browser uploads before examining only its UUID prefixes.
    await cleanup('close fixture page', async () => { await page.close(); });
    if (courseCreated) {
      for (const [bucket, prefix, owns] of [
        [materialBucket, materialPrefix, ownsMaterial],
        [coverBucket, coverPrefix, ownsCover],
      ] as const) {
        await cleanup(`owned ${bucket} objects`, async () => {
          const listed = await service.storage.from(bucket).list(prefix.slice(0, -1), { limit: 100 });
          expect(listed.error).toBeNull();
          expect(listed.data!.length).toBeLessThan(100);
          for (const object of listed.data!) {
            const objectPath = `${prefix}${object.name}`;
            expect(owns(objectPath), 'Refuse removal of an unexpected object.').toBe(true);
            ownedUploads[bucket].add(objectPath);
          }
          if (ownedUploads[bucket].size) {
            expect((await service.storage.from(bucket).remove([...ownedUploads[bucket]])).error).toBeNull();
          }
          const remaining = await service.storage.from(bucket).list(prefix.slice(0, -1), { limit: 100 });
          expect(remaining.error).toBeNull();
          expect(remaining.data).toEqual([]);
        });
      }
      await cleanup('owned course and dependent rows', async () => {
        expect((await service.from('courses').delete().eq('id', ids.course).eq('slug', slug)).error).toBeNull();
        for (const [table, id] of [['courses', ids.course], ['modules', ids.module], ['lessons', ids.lesson]]) {
          const remaining = await service.from(table).select('id').eq('id', id);
          expect(remaining.error).toBeNull();
          expect(remaining.data).toEqual([]);
        }
        const attachments = await service.from('lesson_attachments').select('id').eq('lesson_id', ids.lesson);
        expect(attachments.error).toBeNull();
        expect(attachments.data).toEqual([]);
      });
    }
    expect(cleanupErrors, 'PDF fixture cleanup must preserve shared pilot data.').toEqual([]);
  }
});
