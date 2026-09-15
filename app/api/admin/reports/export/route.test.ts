// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profile: vi.fn(),
  getReportsData: vi.fn(),
  buildReportCsv: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/core/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }),
    }),
  }),
}));
vi.mock('@/features/Admin/reports-queries', () => ({
  getReportsData: mocks.getReportsData,
}));
vi.mock('@/features/Admin/report-csv', () => ({
  buildReportCsv: mocks.buildReportCsv,
}));
vi.mock('@/core/rate-limit', () => ({ rateLimit: mocks.rateLimit }));

import { GET } from './route';

const data = {
  period: {
    key: '30d',
    from: '2026-08-14T12:00:00.000Z',
    to: '2026-09-13T12:00:00.000Z',
    previousFrom: '2026-07-15T12:00:00.000Z',
    previousTo: '2026-08-14T12:00:00.000Z',
  },
};

function request(headers?: HeadersInit) {
  return GET(
    new NextRequest('https://example.test/api/admin/reports/export?period=30d', {
      headers,
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-13T12:00:00.000Z'));
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'admin-id' } },
    error: null,
  });
  mocks.profile.mockResolvedValue({
    data: { role: 'admin', status: 'active', preferred_locale: 'pt' },
    error: null,
  });
  mocks.rateLimit.mockReturnValue({ success: true });
  mocks.getReportsData.mockResolvedValue(data);
  mocks.buildReportCsv.mockReturnValue('localized,csv\n');
});

afterEach(() => vi.useRealTimers());

describe('report export API', () => {
  it.each([
    ['pt', 'en', 'es,pt;q=0.8', 'pt'],
    [null, 'es', 'pt-BR,en;q=0.8', 'es'],
    [null, null, 'pt-BR,en;q=0.8', 'pt'],
  ] as const)(
    'resolves profile %s, cookie %s and browser %s to %s',
    async (preferred, cookie, acceptLanguage, expected) => {
      mocks.profile.mockResolvedValue({
        data: { role: 'admin', status: 'active', preferred_locale: preferred },
        error: null,
      });
      const headers = new Headers({ 'accept-language': acceptLanguage });
      if (cookie) headers.set('cookie', `NEXT_LOCALE=${cookie}`);

      const response = await request(headers);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="reports-30d-2026-09-13.csv"',
      );
      expect(mocks.getReportsData).toHaveBeenCalledWith(
        '30d',
        undefined,
        new Date('2026-09-13T12:00:00.000Z'),
      );
      expect(mocks.buildReportCsv).toHaveBeenCalledWith(
        data,
        expected,
        new Date('2026-09-13T12:00:00.000Z'),
      );
    },
  );

  it('distinguishes a missing session from an unavailable auth provider', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    let response = await request();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'unauthenticated' });

    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'PRIVATE auth details' },
    });
    response = await request();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'report_export_failed',
    });
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it.each([
    [{ data: { role: 'user', status: 'active', preferred_locale: 'pt' }, error: null }, 403, 'access_denied'],
    [{ data: { role: 'admin', status: 'suspended', preferred_locale: 'pt' }, error: null }, 403, 'access_denied'],
    [{ data: null, error: { message: 'PRIVATE profile details' } }, 503, 'report_export_failed'],
  ] as const)('fails closed for an invalid profile', async (profile, status, code) => {
    mocks.profile.mockResolvedValue(profile);
    const response = await request();
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: code });
    expect(mocks.getReportsData).not.toHaveBeenCalled();
  });

  it('returns a stable rate-limit code and retry header', async () => {
    mocks.rateLimit.mockReturnValue({ success: false });
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('3600');
    await expect(response.json()).resolves.toEqual({ error: 'rate_limited' });
    expect(mocks.getReportsData).not.toHaveBeenCalled();
  });

  it('does not expose report read diagnostics', async () => {
    mocks.getReportsData.mockRejectedValue(new Error('PRIVATE database details'));
    const response = await request();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'report_export_failed',
    });
    expect(mocks.buildReportCsv).not.toHaveBeenCalled();
  });
});
