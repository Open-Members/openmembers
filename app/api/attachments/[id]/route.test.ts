// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  access: vi.fn(),
  attachment: vi.fn(),
  profile: vi.fn(),
  sign: vi.fn(),
  download: vi.fn(),
  watermark: vi.fn(),
}));

vi.mock('@/core/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.user } }),
}));
vi.mock('@/core/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle:
            table === 'lesson_attachments' ? mocks.attachment : mocks.profile,
        }),
      }),
    }),
  }),
}));
vi.mock('@/core/access/server', () => ({
  isUserLessonAccessible: mocks.access,
}));
vi.mock('@/core/storage/materials', () => ({
  createMaterialSignedUrl: mocks.sign,
  downloadMaterialBytes: mocks.download,
}));
vi.mock('@/core/pdf/watermark', () => ({ addWatermark: mocks.watermark }));

import { GET } from './route';

const run = (query = '', headers?: HeadersInit) =>
  GET(new NextRequest(`http://localhost/api/attachments/demo${query}`, { headers }), {
    params: Promise.resolve({ id: 'demo' }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({
    data: {
      user: { id: 'session-user', email: 'student@example.test' },
    },
    error: null,
  });
  mocks.access.mockResolvedValue(true);
  mocks.attachment.mockResolvedValue({
    data: {
      id: 'demo',
      file_name: 'guide.txt',
      file_url: 'lessons/demo/guide.txt',
      file_type: 'text/plain',
      lessons: { id: 'lesson' },
    },
    error: null,
  });
  mocks.profile.mockResolvedValue({
    data: { display_name: 'Demo Student', preferred_locale: 'pt' },
    error: null,
  });
  mocks.sign.mockResolvedValue('https://storage.example.test/signed');
  mocks.download.mockResolvedValue(new ArrayBuffer(4));
  mocks.watermark.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

async function expectCode(status: number, code: string) {
  const response = await run();
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ error: code });
}

describe('attachment authorization and reads', () => {
  it('rejects a missing session without reading materials', async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    await expectCode(401, 'unauthenticated');
    expect(mocks.attachment).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('returns a stable unavailable code for an auth provider failure', async () => {
    mocks.user.mockResolvedValue({
      data: { user: null },
      error: { message: 'PRIVATE auth details' },
    });
    await expectCode(503, 'attachment_unavailable');
  });

  it('distinguishes a failed attachment read from a missing row', async () => {
    mocks.attachment.mockResolvedValue({
      data: null,
      error: { message: 'PRIVATE database details' },
    });
    await expectCode(503, 'attachment_unavailable');
    mocks.attachment.mockResolvedValue({ data: null, error: null });
    await expectCode(404, 'attachment_not_found');
  });

  it('rejects denied lesson access before downloading or signing', async () => {
    mocks.access.mockResolvedValue(false);
    await expectCode(403, 'access_denied');
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith(
      'session-user',
      'lesson',
    );
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});

describe('attachment delivery', () => {
  it('issues a five-minute URL only after authorization', async () => {
    const response = await run();
    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.sign).toHaveBeenCalledExactlyOnceWith(
      'lessons/demo/guide.txt',
      300,
    );
  });

  it('does not expose a signed-URL provider error', async () => {
    mocks.sign.mockRejectedValue(new Error('PRIVATE storage details'));
    await expectCode(500, 'attachment_download_failed');
  });

  it('watermarks PDF bytes with profile locale and an explicit instant', async () => {
    mocks.attachment.mockResolvedValue({
      data: {
        id: 'demo',
        file_name: 'guía.pdf',
        file_url: 'lessons/demo/guide.pdf',
        file_type: 'application/pdf',
        lessons: { id: 'lesson' },
      },
      error: null,
    });
    const response = await run('?inline=1');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toBe(
      'inline; filename="gu_a.pdf"',
    );
    expect(mocks.watermark).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      {
        name: 'Demo Student',
        email: 'student@example.test',
        locale: 'pt',
        downloadedAt: expect.any(String),
      },
    );
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('uses request negotiation when the profile locale is still null', async () => {
    mocks.attachment.mockResolvedValue({
      data: {
        id: 'demo',
        file_name: 'guide.pdf',
        file_url: 'lessons/demo/guide.pdf',
        file_type: 'application/pdf',
        lessons: { id: 'lesson' },
      },
      error: null,
    });
    mocks.profile.mockResolvedValue({
      data: { display_name: 'María', preferred_locale: null },
      error: null,
    });
    await run('', { cookie: 'NEXT_LOCALE=es' });
    expect(mocks.watermark).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({ locale: 'es' }),
    );
  });

  it('does not watermark with a fallback locale after a profile read failure', async () => {
    mocks.attachment.mockResolvedValue({
      data: {
        id: 'demo',
        file_name: 'guide.pdf',
        file_url: 'lessons/demo/guide.pdf',
        file_type: 'application/pdf',
        lessons: { id: 'lesson' },
      },
      error: null,
    });
    mocks.profile.mockResolvedValue({
      data: null,
      error: { message: 'PRIVATE profile details' },
    });
    await expectCode(503, 'attachment_unavailable');
    expect(mocks.watermark).not.toHaveBeenCalled();
  });

  it('does not expose a PDF or watermark provider error', async () => {
    mocks.attachment.mockResolvedValue({
      data: {
        id: 'demo',
        file_name: 'guide.pdf',
        file_url: 'lessons/demo/guide.pdf',
        file_type: 'application/pdf',
        lessons: { id: 'lesson' },
      },
      error: null,
    });
    mocks.watermark.mockRejectedValue(new Error('PRIVATE pdf details'));
    await expectCode(500, 'attachment_processing_failed');
  });
});
