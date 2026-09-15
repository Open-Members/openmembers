'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Award, Loader2 } from 'lucide-react';
import { appToast } from '@/shared/lib/toast';
import { isSafeCertificateFileName } from '@/core/certificates/localization';

function responseFileName(header: string | null, fallback: string): string {
  const safeFallback = isSafeCertificateFileName(fallback)
    ? fallback
    : 'certificate.pdf';
  if (!header || /[\r\n]/.test(header)) return safeFallback;

  const match = header.match(
    /(?:^|;)\s*filename\s*=\s*(?:"([^"]+)"|([^;\s]+))(?=\s*(?:;|$))/i,
  );
  const value = (match?.[1] ?? match?.[2])?.trim();
  return isSafeCertificateFileName(value) ? value : safeFallback;
}

export function CertificateDownloadButton({ courseId }: { courseId: string }) {
  const t = useTranslations('certificates.download');
  const [loading, setLoading] = useState(false);

  const download = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/certificates/${courseId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const key =
          response.status === 401
            ? 'unauthenticated'
            : response.status === 429
              ? 'rateLimited'
              : response.status === 403 ||
                  response.status === 404 ||
                  response.status === 503
                ? 'unavailable'
                : 'failed';
        appToast.danger(t('title'), t(key));
        return;
      }

      const contentType = response.headers
        .get('content-type')
        ?.split(';', 1)[0]
        .trim()
        .toLowerCase();
      if (contentType !== 'application/pdf') {
        appToast.danger(t('title'), t('invalidResponse'));
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = responseFileName(
        response.headers.get('content-disposition'),
        t('fileNameFallback'),
      );
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      appToast.danger(t('title'), t('failed'));
    } finally {
      setLoading(false);
    }
  }, [courseId, loading, t]);

  return (
    <button
      type="button"
      onClick={download}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow disabled:opacity-60"
      style={{ backgroundColor: 'var(--color-primary)' }}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Award className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {loading ? t('loading') : t('label')}
    </button>
  );
}
