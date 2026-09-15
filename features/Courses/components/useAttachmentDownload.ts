'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { appToast } from '@/shared/lib/toast';

export type UseAttachmentDownload = {
  isLoading: boolean;
  download: () => Promise<void>;
};

/**
 * Client-side download for `/api/attachments/:id`.
 *
 * Why we don't use a bare `<a href>`: same-tab navigation to the API route
 * means the user loses the page they were on, and iOS Safari's download
 * prompt is so subtle that students kept tapping the reload icon (which they
 * mistook for a refresh button) instead of the prompt. Streaming the bytes
 * through `fetch` + a Blob URL keeps the user on the reader and gives us a
 * real loading state, so failures surface as a toast instead of a blank tab.
 */
export function useAttachmentDownload(input: {
  id: string;
  fileName: string;
}): UseAttachmentDownload {
  const t = useTranslations('learningMedia.download');
  const [isLoading, setIsLoading] = useState(false);

  const download = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);

    const endpoint = `/api/attachments/${input.id}`;
    try {
      // The session cookie is needed only by our same-origin authorization
      // endpoint. Non-PDF responses redirect to a tokenized Storage URL whose
      // wildcard CORS response cannot be consumed in `include` mode.
      const res = await fetch(endpoint, { credentials: 'same-origin' });
      if (!res.ok) {
        const key = res.status === 401 ? 'unauthenticated'
          : res.status === 403 ? 'forbidden'
            : res.status === 404 || res.status === 503 ? 'unavailable' : 'failed';
        appToast.danger(t('title'), t(key));
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = input.fileName || 'download.pdf';
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // iOS Safari needs the object URL alive briefly after the click for the
      // download to actually start. 60s is well past that without leaking.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      appToast.danger(t('title'), t('failed'));
    } finally {
      setIsLoading(false);
    }
  }, [input.id, input.fileName, isLoading, t]);

  return { isLoading, download };
}
