'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/core/i18n/routing';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('system.pageError');
  // Surface the error so it shows up in Vercel logs / dev console.
  // digest is set on server-rendered errors and helps Vercel correlate.
  useEffect(() => {
    console.error('[error boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-background)] px-6 py-16 text-center">
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 blur-3xl opacity-20"
          style={{
            background:
              'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)',
          }}
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-hairline bg-[var(--color-card)] text-[var(--color-accent)] shadow-sm">
          <AlertTriangle className="h-7 w-7" />
        </div>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--color-muted-foreground)]">
        {t('eyebrow')}
      </p>

      <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-[var(--color-foreground)] max-w-xl leading-tight">
        {t('title')}
      </h1>

      <p className="text-base text-[var(--color-muted-foreground)] max-w-md leading-relaxed">
        {t('description')}
      </p>

      {error.digest && (
        <p className="text-xs font-mono text-[var(--color-muted-foreground)]/70">
          {t('reference', { digest: error.digest })}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap justify-center">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_3px_0_var(--color-primary-dark)] transition-all active:translate-y-[2px] active:shadow-[0_1px_0_var(--color-primary-dark)]"
        >
          <RefreshCw className="w-4 h-4" />
          {t('retry')}
        </button>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('back')}
        </Link>
      </div>
    </div>
  );
}
