import { Link } from '@/core/i18n/routing';
import { Compass, ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('system.notFound');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-background)] px-6 py-16 text-center">
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 blur-3xl opacity-20"
          style={{
            background:
              'radial-gradient(circle, var(--color-primary) 0%, transparent 70%)',
          }}
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-hairline bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm">
          <Compass className="h-7 w-7" />
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

      <div className="flex items-center gap-3 flex-wrap justify-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white shadow-[0_3px_0_var(--color-primary-dark)] transition-all active:translate-y-[2px] active:shadow-[0_1px_0_var(--color-primary-dark)]"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('back')}
        </Link>
        <Link
          href="/courses"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
        >
          <Compass className="w-4 h-4" />
          {t('courses')}
        </Link>
      </div>
    </div>
  );
}
