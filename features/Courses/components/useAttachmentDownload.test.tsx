import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/core/i18n/locales/en/learningMedia.json';
import pt from '@/core/i18n/locales/pt/learningMedia.json';
import es from '@/core/i18n/locales/es/learningMedia.json';
import { useAttachmentDownload } from './useAttachmentDownload';

const danger = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/toast', () => ({ appToast: { danger } }));
const catalogs = { en, pt, es };
function wrapper(locale: keyof typeof catalogs) {
  return function LocaleProvider({ children }: { children: ReactNode }) {
    return <NextIntlClientProvider locale={locale} messages={{ learningMedia: catalogs[locale] }} timeZone="UTC">{children}</NextIntlClientProvider>;
  };
}

beforeEach(() => {
  danger.mockReset();
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:download-test');
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each(['en', 'pt', 'es'] as const)('Attachment download in %s', (locale) => {
  const copy = catalogs[locale].download;
  it.each([[401, 'unauthenticated'], [403, 'forbidden'], [404, 'unavailable'], [500, 'failed']] as const)('uses localized status %s errors instead of raw provider messages', async (status, key) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'PRIVATE diagnostic' }), { status }));
    const { result } = renderHook(() => useAttachmentDownload({ id: 'file-id', fileName: 'Authored.pdf' }), { wrapper: wrapper(locale) });
    await act(async () => { await result.current.download(); });
    expect(danger).toHaveBeenCalledExactlyOnceWith(copy.title, copy[key]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('localizes transport failures and releases the loading state for retry', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('PRIVATE transport failure'));
    const { result } = renderHook(() => useAttachmentDownload({ id: 'file-id', fileName: 'Authored.pdf' }), { wrapper: wrapper(locale) });
    await act(async () => { await result.current.download(); });
    expect(danger).toHaveBeenCalledExactlyOnceWith(copy.title, copy.failed);
    expect(result.current.isLoading).toBe(false);
  });
});

it('keeps the authored filename and revokes the URL after the download grace period', async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockResolvedValue(new Response('local test bytes'));
  let downloadedName: string | undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloadedName = this.download; });
  const { result } = renderHook(() => useAttachmentDownload({ id: 'file-id', fileName: 'Guía original.pdf' }), { wrapper: wrapper('pt') });
  await act(async () => { await result.current.download(); });
  expect(downloadedName).toBe('Guía original.pdf');
  expect(fetch).toHaveBeenCalledWith('/api/attachments/file-id', { credentials: 'same-origin' });
  expect(danger).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:download-test');
});
