// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  access: vi.fn(),
  build: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/core/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/core/access/server', () => ({
  isUserCourseAccessible: mocks.access,
}));
vi.mock('@/core/certificates/service', () => ({
  buildCertificatePdf: mocks.build,
}));
vi.mock('@/core/rate-limit', () => ({ rateLimit: mocks.rateLimit }));

import { GET } from './route';

function download(headers?: HeadersInit) {
  return GET(
    new NextRequest('https://example.org/api/certificates/demo-course', {
      headers,
    }),
    { params: Promise.resolve({ courseId: 'demo-course' }) },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'session-user' } },
    error: null,
  });
  mocks.access.mockResolvedValue(true);
  mocks.rateLimit.mockReturnValue({ success: true });
  mocks.build.mockResolvedValue({
    bytes: new Uint8Array([37, 80, 68, 70]),
    fileName: 'demo.pdf',
  });
});

async function expectCode(status: number, code: string) {
  const response = await download();
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ error: code });
}

describe('certificate authorization before privileged generation', () => {
  it('rejects an unauthenticated request without issuing a certificate', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expectCode(401, 'unauthenticated');
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it('distinguishes a session read failure from a signed-out user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'PRIVATE auth failure' },
    });
    await expectCode(503, 'certificate_unavailable');
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('rejects denied course access before PDF generation', async () => {
    mocks.access.mockResolvedValue(false);
    await expectCode(403, 'access_denied');
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith(
      'session-user',
      'demo-course',
    );
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it('returns a stable code if access verification throws', async () => {
    mocks.access.mockRejectedValue(new Error('PRIVATE access failure'));
    await expectCode(503, 'certificate_unavailable');
    expect(mocks.build).not.toHaveBeenCalled();
  });
});

describe('certificate API response contract', () => {
  it('returns a stable rate-limit code and retry header', async () => {
    mocks.rateLimit.mockReturnValue({ success: false });
    const response = await download();
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('3600');
    await expect(response.json()).resolves.toEqual({ error: 'rate_limited' });
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it.each([
    ['course_not_found', 404],
    ['cert_disabled', 403],
    ['not_complete', 403],
    ['certificate_unavailable', 503],
    ['certificate_generation_failed', 500],
  ] as const)('maps %s to HTTP %s without changing the code', async (code, status) => {
    mocks.build.mockResolvedValue({ error: code });
    await expectCode(status, code);
  });

  it('does not expose an exceptional generator message', async () => {
    mocks.build.mockRejectedValue(new Error('PRIVATE provider details'));
    await expectCode(503, 'certificate_unavailable');
  });

  it('streams only the authenticated identity as a private PDF', async () => {
    const response = await download({ cookie: 'NEXT_LOCALE=pt' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toContain(
      'filename="demo.pdf"',
    );
    expect(mocks.build).toHaveBeenCalledWith(
      'session-user',
      'demo-course',
      {
        localeHint: 'pt',
        now: expect.any(Date),
      },
    );
  });

  it.each([
    '../private.pdf',
    '..\\private.pdf',
    'certificate\r\nContent-Disposition-evil.pdf',
    'certificate".pdf',
  ])('rejects an unsafe generated filename before writing headers: %s', async (fileName) => {
    mocks.build.mockResolvedValue({
      bytes: new Uint8Array([37, 80, 68, 70]),
      fileName,
    });
    const response = await download();
    expect(response.status).toBe(500);
    expect(response.headers.get('content-disposition')).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: 'certificate_generation_failed',
    });
  });
});
