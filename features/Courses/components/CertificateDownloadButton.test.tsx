import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/core/i18n/locales/en/certificates.json';
import es from '@/core/i18n/locales/es/certificates.json';
import pt from '@/core/i18n/locales/pt/certificates.json';
import { CertificateDownloadButton } from './CertificateDownloadButton';

const mocks = vi.hoisted(() => ({ danger: vi.fn() }));
vi.mock('@/shared/lib/toast', () => ({
  appToast: { danger: mocks.danger },
}));

const catalogs = { en, pt, es };

function wrapper(locale: keyof typeof catalogs) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale={locale}
        messages={{ certificates: catalogs[locale] }}
        timeZone="UTC"
      >
        {children}
      </NextIntlClientProvider>
    );
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:certificate-test');
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
  'certificate download in %s',
  (locale) => {
    const copy = catalogs[locale].download;

    it.each([
      [401, 'unauthenticated'],
      [403, 'unavailable'],
      [404, 'unavailable'],
      [429, 'rateLimited'],
      [500, 'failed'],
      [503, 'unavailable'],
    ] as const)('localizes HTTP %s as %s', async (status, key) => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: 'PRIVATE diagnostic' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      render(<CertificateDownloadButton courseId="course-1" />, {
        wrapper: wrapper(locale),
      });
      fireEvent.click(screen.getByRole('button', { name: copy.label }));
      await waitFor(() =>
        expect(mocks.danger).toHaveBeenCalledWith(copy.title, copy[key]),
      );
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('uses the localized fallback when the filename header is missing', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockResolvedValue(
        new Response(new Uint8Array([37, 80, 68, 70]), {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      );
      let downloadedName: string | undefined;
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloadedName = this.download;
      });
      render(<CertificateDownloadButton courseId="course-1" />, {
        wrapper: wrapper(locale),
      });
      fireEvent.click(screen.getByRole('button', { name: copy.label }));
      await act(async () => {});

      expect(downloadedName).toBe(copy.fileNameFallback);
    });
  },
);

it('rejects a successful JSON response instead of downloading it', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: 'PRIVATE diagnostic' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
  render(<CertificateDownloadButton courseId="course-1" />, {
    wrapper: wrapper('pt'),
  });
  fireEvent.click(screen.getByRole('button', { name: pt.download.label }));
  await waitFor(() =>
    expect(mocks.danger).toHaveBeenCalledWith(
      pt.download.title,
      pt.download.invalidResponse,
    ),
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('downloads a validated PDF with the response filename and revokes its URL', async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockResolvedValue(
    new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf; charset=binary',
        'Content-Disposition': 'attachment; filename="certificate-authored.pdf"',
      },
    }),
  );
  let downloadedName: string | undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedName = this.download;
  });
  render(<CertificateDownloadButton courseId="course-1" />, {
    wrapper: wrapper('es'),
  });
  fireEvent.click(screen.getByRole('button', { name: es.download.label }));
  await act(async () => {});

  expect(fetch).toHaveBeenCalledWith('/api/certificates/course-1', {
    credentials: 'include',
  });
  expect(downloadedName).toBe('certificate-authored.pdf');
  expect(mocks.danger).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(60_000));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:certificate-test');
});

it.each([
  'attachment; filename="../../private.pdf"',
  'attachment; filename="certificate..pdf"',
  'attachment; filename="certificate;private.pdf"',
  'attachment; filename="certificate?.pdf"',
])('falls back locally for an unsafe response filename: %s', async (header) => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockResolvedValue(
    new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
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
  render(<CertificateDownloadButton courseId="course-1" />, {
    wrapper: wrapper('pt'),
  });
  fireEvent.click(screen.getByRole('button', { name: pt.download.label }));
  await act(async () => {});

  expect(downloadedName).toBe(pt.download.fileNameFallback);
});
