import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';

export default async function AccountUnavailablePage() {
  const t = await getTranslations('system.accountUnavailable');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-background)] px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-hairline bg-[var(--color-card)] text-[var(--color-accent)] shadow-sm">
        <AlertTriangle className="h-7 w-7" aria-hidden />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--color-muted-foreground)]">
        {t('eyebrow')}
      </p>
      <h1 className="font-display max-w-xl text-3xl font-medium tracking-tight text-[var(--color-foreground)] md:text-4xl">
        {t('title')}
      </h1>
      <p className="max-w-md text-base leading-relaxed text-[var(--color-muted-foreground)]">
        {t('description')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {t('retry')}
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold text-[var(--color-foreground)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('home')}
        </Link>
      </div>
    </main>
  );
}
