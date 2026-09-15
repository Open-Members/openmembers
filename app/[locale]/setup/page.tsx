import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';
import { getTenantSettings } from '@/core/theme/settings';

export async function generateMetadata(): Promise<Metadata> {
  const [settings, t] = await Promise.all([getTenantSettings(), getTranslations('authPages.setup')]);
  return { title: t('metadataTitle', { siteName: settings.site_name }), description: t('description') };
}

export default async function SetupPage() {
  const [settings, t] = await Promise.all([getTenantSettings(), getTranslations('authPages.setup')]);
  return (
    <main id="main-content" className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--color-muted-foreground)]">{settings.site_name}</p>
      <h1 className="text-4xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-lg text-[var(--color-muted-foreground)]">
        {t('description')}
      </p>
      <Link href="/" className="font-semibold underline underline-offset-4">{t('backToHome')}</Link>
    </main>
  );
}
