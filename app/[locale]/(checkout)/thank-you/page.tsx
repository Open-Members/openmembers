import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Clock3, Info } from 'lucide-react';
import { PurchaseTracker } from '@/shared/components/analytics';
import { getInstallationConfig } from '@/core/config/installation.server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('thankyou');
  return {
    title: t('metaTitle'),
    // Conversion page — keep it out of search engines.
    robots: { index: false, follow: false },
  };
}

export default async function ThankYouPage() {
  const [t, config] = await Promise.all([
    getTranslations('thankyou'),
    getInstallationConfig(),
  ]);
  const helpUrl = config.links.help ?? config.links.support;

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-[var(--color-background)] px-6 py-16">
      {/* Optional purchase analytics; access is granted by server-side processing. */}
      <Suspense fallback={null}>
        <PurchaseTracker />
      </Suspense>

      <div className="max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
            <Clock3 className="h-10 w-10 text-[var(--color-primary)]" />
          </div>
        </div>

        <h1 className="mb-3 text-2xl font-black text-[var(--color-primary-dark)]">
          {t('heading')}
        </h1>
        <p className="mb-8 text-sm font-semibold text-[var(--color-muted-foreground)]">
          {t('subtitle')}
        </p>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 text-left">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--color-primary)]" />
            <div className="space-y-2">
              <p className="text-sm leading-relaxed text-[var(--color-foreground)]">
                {t('emailNote')}
              </p>
              <p className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                {t('spamNote')}
              </p>
            </div>
          </div>
        </div>
        {helpUrl && (
          <a href={helpUrl} className="mt-6 inline-flex min-h-11 items-center font-semibold text-[var(--color-primary)] underline underline-offset-4">
            {t('helpLink')}
          </a>
        )}
      </div>
    </div>
  );
}
