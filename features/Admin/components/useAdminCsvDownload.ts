'use client';

import { useCallback, useState } from 'react';
import { appToast } from '@/shared/lib/toast';

export type AdminCsvDownloadCopy = {
  title: string;
  unauthenticated: string;
  accessDenied: string;
  rateLimited: string;
  invalidResponse: string;
  failed: string;
};

type DownloadErrorKey = keyof Omit<AdminCsvDownloadCopy, 'title'>;

async function responseError(response: Response): Promise<DownloadErrorKey> {
  let code = '';
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === 'string') code = payload.error;
  } catch {
    // Status still supplies a safe fallback when the response is not JSON.
  }

  if (code === 'unauthenticated') return 'unauthenticated';
  if (code === 'access_denied') return 'accessDenied';
  if (code === 'rate_limited') return 'rateLimited';
  if (
    code === 'report_export_failed' ||
    code === 'users_export_failed'
  ) {
    return 'failed';
  }

  if (response.status === 401) return 'unauthenticated';
  if (response.status === 403) return 'accessDenied';
  if (response.status === 429) return 'rateLimited';
  return 'failed';
}

const MAX_CSV_FILE_NAME_LENGTH = 160;

function isSafeCsvFileName(value: string): boolean {
  return value.length <= MAX_CSV_FILE_NAME_LENGTH
    && !value.includes('..')
    && /^[\p{L}\p{N}][\p{L}\p{N} ._-]*\.csv$/iu.test(value);
}

function responseFileName(header: string | null, fallback: string): string {
  const safeFallback = isSafeCsvFileName(fallback) ? fallback : 'export.csv';
  if (!header || /[\r\n]/.test(header)) return safeFallback;

  const encoded = header.match(/(?:^|;)\s*filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = header.match(
    /(?:^|;)\s*filename\s*=\s*(?:"([^"]+)"|([^;\s]+))(?=\s*(?:;|$))/i,
  );
  let value = encoded ?? plain?.[1] ?? plain?.[2] ?? '';
  if (encoded) {
    try {
      value = decodeURIComponent(encoded);
    } catch {
      value = '';
    }
  }
  value = value.trim();
  return isSafeCsvFileName(value) ? value : safeFallback;
}

export function useAdminCsvDownload(input: {
  endpoint: string;
  fallbackFileName: string;
  copy: AdminCsvDownloadCopy;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const download = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const response = await fetch(input.endpoint, { credentials: 'include' });
      if (!response.ok) {
        const key = await responseError(response);
        appToast.danger(input.copy.title, input.copy[key]);
        return;
      }

      const contentType = response.headers
        .get('content-type')
        ?.split(';', 1)[0]
        .trim()
        .toLowerCase();
      if (contentType !== 'text/csv') {
        appToast.danger(input.copy.title, input.copy.invalidResponse);
        return;
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        appToast.danger(input.copy.title, input.copy.invalidResponse);
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = responseFileName(
        response.headers.get('content-disposition'),
        input.fallbackFileName,
      );
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      appToast.danger(input.copy.title, input.copy.failed);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading]);

  return { download, isLoading };
}
