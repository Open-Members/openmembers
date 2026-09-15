import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/core/i18n/locales/en/adminReports.json';
import es from '@/core/i18n/locales/es/adminReports.json';
import pt from '@/core/i18n/locales/pt/adminReports.json';
import { AdminCsvDownloadButton } from './AdminCsvDownloadButton';
import { useAdminCsvDownload } from './useAdminCsvDownload';

const mocks = vi.hoisted(() => ({ danger: vi.fn() }));

vi.mock('@/shared/lib/toast', () => ({
  appToast: { danger: mocks.danger },
}));

const catalogs = { en, pt, es };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:admin-csv-test');
      static revokeObjectURL = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each(['en', 'pt', 'es'] as const)(
  'admin CSV download in %s',
  (locale) => {
    const copy = catalogs[locale].download;

    it.each([
      [401, 'unauthenticated', 'unauthenticated'],
      [403, 'access_denied', 'accessDenied'],
      [429, 'rate_limited', 'rateLimited'],
      [503, 'report_export_failed', 'failed'],
    ] as const)(
      'maps stable %s/%s responses to localized copy',
      async (status, error, copyKey) => {
        vi.mocked(fetch).mockResolvedValue(
          new Response(JSON.stringify({ error, diagnostic: 'PRIVATE detail' }), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
        const { result } = renderHook(() =>
          useAdminCsvDownload({
            endpoint: '/api/admin/reports/export?period=30d',
            fallbackFileName: 'reports-30d.csv',
            copy,
          }),
        );

        await act(async () => {
          await result.current.download();
        });

        expect(mocks.danger).toHaveBeenCalledExactlyOnceWith(
          copy.title,
          copy[copyKey],
        );
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(result.current.isLoading).toBe(false);
      },
    );
  },
);

it('downloads a validated CSV with the response filename and revokes its URL', async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockResolvedValue(
    new Response('metric,value\nactive_users,7\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          "attachment; filename*=UTF-8''relat%C3%B3rio-t%C3%A9cnico.csv",
      },
    }),
  );
  let downloadedName: string | undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedName = this.download;
  });
  const copy = pt.download;
  const { result } = renderHook(() =>
    useAdminCsvDownload({
      endpoint: '/api/admin/reports/export?period=30d',
      fallbackFileName: 'reports-30d.csv',
      copy,
    }),
  );

  await act(async () => {
    await result.current.download();
  });

  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/admin/reports/export?period=30d',
    { credentials: 'include' },
  );
  expect(downloadedName).toBe('relatório-técnico.csv');
  expect(mocks.danger).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(60_000));
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
    'blob:admin-csv-test',
  );
});

it.each([
  'attachment; filename="../../private.csv"',
  'attachment; filename="report..csv"',
  'attachment; filename="payload.html"',
  `attachment; filename="${'a'.repeat(161)}.csv"`,
  'attachment; filename="report;payload.csv"',
])('uses the known fallback for an unsafe response filename: %s', async (header) => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockResolvedValue(
    new Response('metric,value\nactive_users,7\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': header,
      },
    }),
  );
  let downloadedName: string | undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedName = this.download;
  });
  const { result } = renderHook(() =>
    useAdminCsvDownload({
      endpoint: '/api/admin/reports/export',
      fallbackFileName: 'reports-30d.csv',
      copy: en.download,
    }),
  );

  await act(async () => {
    await result.current.download();
  });

  expect(downloadedName).toBe('reports-30d.csv');
});

it.each([
  ['application/json', '{"error":"PRIVATE detail"}'],
  ['text/csv', ''],
] as const)(
  'rejects a successful but invalid %s response',
  async (contentType, body) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': contentType },
      }),
    );
    const { result } = renderHook(() =>
      useAdminCsvDownload({
        endpoint: '/api/admin/users/export',
        fallbackFileName: 'users.csv',
        copy: es.download,
      }),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(mocks.danger).toHaveBeenCalledExactlyOnceWith(
      es.download.title,
      es.download.invalidResponse,
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  },
);

it('shows the localized loading label and disables repeated button clicks', async () => {
  let resolveResponse!: (response: Response) => void;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
  );

  render(
    <AdminCsvDownloadButton
      endpoint="/api/admin/users/export"
      fallbackFileName="users.csv"
      label="Baixar CSV"
      loadingLabel={pt.download.loading}
      title={pt.download.title}
      copy={pt.download}
      className="test-button"
    />,
  );
  const button = screen.getByRole('button', { name: 'Baixar CSV' });

  fireEvent.click(button);
  expect(
    screen.getByRole('button', { name: pt.download.loading }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button'));
  expect(fetch).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveResponse(
      new Response('metric,value\nactive_users,7\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }),
    );
  });

  expect(screen.getByRole('button', { name: 'Baixar CSV' })).toBeEnabled();
});
