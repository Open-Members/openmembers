// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ configured: vi.fn(), getUser: vi.fn(), profile: vi.fn(), lesson: vi.fn(), access: vi.fn(), upload: vi.fn(), playback: vi.fn(), admin: vi.fn(), limit: vi.fn() }));
vi.mock('@/core/config/env', () => ({ hasSupabaseConfiguration: () => true, hasSupabaseAdminConfiguration: () => true }));
vi.mock('@/lib/services/r2/client', () => ({ isR2Configured: mocks.configured }));
vi.mock('@/core/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }) }) }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/core/access/server', () => ({ isUserLessonAccessible: mocks.access }));
vi.mock('@/lib/services/r2/presign', () => ({ presignUpload: mocks.upload, presignPlayback: mocks.playback, buildLessonVideoKey: () => 'lessons/demo/video.mp4', buildCourseTrailerKey: () => 'courses/demo/trailer/video.mp4' }));
vi.mock('@/core/rate-limit', () => ({ rateLimit: mocks.limit }));
import { POST } from './upload-url/route';
import { GET } from './playback-url/route';
const id = '11111111-1111-4111-8111-111111111111';
const valid = { scopeId: id, filename: 'lesson.mp4', contentType: 'video/mp4', size: 1024 };
const upload = (body: unknown = valid) => POST(new NextRequest('http://localhost/api/r2/upload-url', { method: 'POST', body: JSON.stringify(body) }));
const playback = (lessonId = id) => GET(new NextRequest(`http://localhost/api/r2/playback-url?lessonId=${lessonId}`));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'session-user' } } });
  mocks.profile.mockResolvedValue({ data: { role: 'admin', status: 'active' } });
  mocks.access.mockResolvedValue(true);
  mocks.admin.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.lesson }) }) }) });
  mocks.lesson.mockResolvedValue({ data: { id, video_provider: 'r2', video_external_id: 'old-timestamp-key.mp4' }, error: null });
  mocks.upload.mockResolvedValue('https://storage.example.test/upload');
  mocks.playback.mockResolvedValue('https://storage.example.test/playback');
  mocks.limit.mockReturnValue({ success: true });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('R2 URL issuance', () => {
  it('does no work without configuration', async () => {
    mocks.configured.mockReturnValue(false);
    expect((await upload()).status).toBe(503);
    expect((await playback()).status).toBe(503);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it('rejects missing sessions', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await upload()).status).toBe(401);
    expect((await playback()).status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.playback).not.toHaveBeenCalled();
  });
  for (const profile of [{ role: 'user', status: 'active' }, { role: 'admin', status: 'suspended' }, null]) {
    it(`rejects upload for profile ${JSON.stringify(profile)}`, async () => {
      mocks.profile.mockResolvedValue({ data: profile });
      expect((await upload()).status).toBe(403);
      expect(mocks.upload).not.toHaveBeenCalled();
    });
  }
  it('rejects malformed upload data before signing', async () => {
    expect((await upload(null)).status).toBe(400);
    expect((await upload({ ...valid, scopeId: '../other', size: -1 })).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rate limits upload signing', async () => {
    mocks.limit.mockReturnValue({ success: false });
    expect((await upload()).status).toBe(429);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('returns a noncached URL for authorized valid upload', async () => {
    const response = await upload();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith({ key: 'lessons/demo/video.mp4', contentType: 'video/mp4' });
  });
  it('rejects invalid lesson IDs before access or privileged lookup', async () => {
    expect((await playback('invalid')).status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('blocks inaccessible/expired/drip-locked lessons before privileged lookup or signing', async () => {
    mocks.access.mockResolvedValue(false);
    expect((await playback()).status).toBe(403);
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith('session-user', id);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.playback).not.toHaveBeenCalled();
  });
  it('keeps old keys readable after authorization and never caches the URL', async () => {
    const response = await playback();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.playback).toHaveBeenCalledExactlyOnceWith('old-timestamp-key.mp4');
  });
  it('distinguishes lookup failure from an absent record', async () => {
    mocks.lesson.mockResolvedValue({ data: null, error: { message: 'private database details' } });
    const response = await playback();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private database details');
    expect(mocks.playback).not.toHaveBeenCalled();
  });
  it('does not expose provider exceptions', async () => {
    mocks.upload.mockRejectedValue(new Error('private credential details'));
    mocks.playback.mockRejectedValue(new Error('private credential details'));
    for (const response of [await upload(), await playback()]) {
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain('private credential details');
    }
  });
});
