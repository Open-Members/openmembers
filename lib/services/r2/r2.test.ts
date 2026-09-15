// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseVideoUpload, MAX_VIDEO_BYTES } from './upload';
import { isR2Configured } from './client';
import { buildLessonVideoKey, buildCourseTrailerKey, presignUpload, presignPlayback } from './presign';

const id = '11111111-1111-4111-8111-111111111111';
const valid = { scopeId: id, filename: 'lesson.mp4', contentType: 'video/mp4', size: 1024 };
beforeEach(() => {
  vi.stubEnv('R2_ACCOUNT_ID', 'a'.repeat(32));
  vi.stubEnv('R2_ACCESS_KEY_ID', 'fictitious-access-key');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'fictitious-secret-for-offline-signing');
  vi.stubEnv('R2_BUCKET_NAME', 'openmembers-test');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('R2 configuration and upload contract', () => {
  it('requires every value, excluding whitespace-only credentials', () => {
    expect(isR2Configured()).toBe(true);
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) {
      const saved = process.env[key];
      vi.stubEnv(key, '  ');
      expect(isR2Configured()).toBe(false);
      vi.stubEnv(key, saved);
    }
  });
  it('accepts canonical scopes and the legacy lessonId alias', () => {
    expect(parseVideoUpload(valid)).toMatchObject({ scope: 'lesson', scopeId: id });
    expect(parseVideoUpload({ ...valid, scope: 'course-trailer' })).toMatchObject({ scope: 'course-trailer' });
    expect(parseVideoUpload({ ...valid, scopeId: undefined, lessonId: id })).toMatchObject({ scopeId: id });
  });
  for (const change of [
    { scope: 'anything' }, { scopeId: '../other' }, { scopeId: undefined },
    { filename: '../lesson.mp4' }, { filename: '' }, { contentType: 'text/html' },
    { size: undefined }, { size: -1 }, { size: 0 }, { size: 1.5 }, { size: MAX_VIDEO_BYTES + 1 },
    { size: '1024' }, { scope: 'course-trailer', lessonId: id }, { secret: 'unexpected' },
  ]) {
    it(`rejects invalid input ${JSON.stringify(change)}`, () => expect(parseVideoUpload({ ...valid, ...change })).toBeNull());
  }
  it('rejects null or an array', () => {
    expect(parseVideoUpload(null)).toBeNull();
    expect(parseVideoUpload([])).toBeNull();
  });
  it('gives concurrent drafts unique keys in the correct namespace', () => {
    const first = buildLessonVideoKey(id, 'name.mp4');
    expect(first).toMatch(new RegExp(`^lessons/${id}/[0-9a-f-]+\\.mp4$`));
    expect(buildLessonVideoKey(id, 'name.mp4')).not.toBe(first);
    expect(buildCourseTrailerKey(id, 'name.webm')).toMatch(new RegExp(`^courses/${id}/trailer/[0-9a-f-]+\\.webm$`));
  });
});

it('signs PUT and GET with the real SDK without contacting R2', async () => {
  const key = buildLessonVideoKey(id, 'lesson.mp4');
  const put = new URL(await presignUpload({ key, contentType: 'video/mp4' }));
  const get = new URL(await presignPlayback(key));
  expect(put.hostname).toBe(`openmembers-test.${'a'.repeat(32)}.r2.cloudflarestorage.com`);
  expect(put.searchParams.get('X-Amz-Expires')).toBe('3600');
  expect(get.searchParams.get('X-Amz-Expires')).toBe('21600');
  expect(put.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
  expect(put.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  expect(get.searchParams.get('X-Amz-Signature')).not.toBe(put.searchParams.get('X-Amz-Signature'));
});
