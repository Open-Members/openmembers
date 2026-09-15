import { getTranslations } from 'next-intl/server';
import { getTenantSettings } from '@/core/theme/settings';
import { getInstallationConfig } from '@/core/config/installation.server';

type Section = { title: string; body: string };

export async function LegalPage({ scope }: { scope: 'terms' | 'privacy' }) {
  const [t, tCommon, settings, config] = await Promise.all([
    getTranslations(`legal.${scope}`),
    getTranslations('legal.common'),
    getTenantSettings(),
    getInstallationConfig(),
  ]);

  const sections = t.raw('sections') as Section[];
  const siteName = settings.site_name;
  const documentUrl = config.links[scope];
  const withSiteName = (text: string) => text.replace(/\{siteName\}/g, siteName);

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-foreground)] md:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          {tCommon('updatedLabel')}: {documentUrl ? tCommon('publishedStatus') : t('updatedAt')}
        </p>
      </header>

      <p className="mb-10 text-base leading-relaxed text-[var(--color-foreground)]">
        {documentUrl ? tCommon('publishedIntro', { siteName }) : t('intro', { siteName })}
      </p>

      {documentUrl ? (
        <a
          href={documentUrl}
          className="inline-flex min-h-11 items-center rounded-xl bg-[var(--color-primary)] px-5 py-3 font-semibold text-[var(--color-primary-foreground)]"
        >
          {tCommon('openDocument')}
        </a>
      ) : <div className="space-y-8">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="mb-2 text-lg font-semibold text-[var(--color-foreground)] md:text-xl">
              {s.title}
            </h2>
            <p className="text-base leading-relaxed text-[var(--color-muted-foreground)]">
              {withSiteName(s.body)}
            </p>
          </section>
        ))}
      </div>}
    </article>
  );
}
