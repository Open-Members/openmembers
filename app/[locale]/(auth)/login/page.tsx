import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';
import LoginForm from '@/features/Auth/components/LoginForm';
import { AuthErrorBanner, AuthShell } from '@/features/Auth/components/shared';
import { getTenantSettings } from '@/core/theme/settings';

export async function generateMetadata(): Promise<Metadata> {
  const [settings, t] = await Promise.all([getTenantSettings(), getTranslations('authPages.login')]);
  return {
    title: t('metadataTitle', { siteName: settings.site_name }),
    description: t('metadataDescription'),
  };
}

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const [t, query] = await Promise.all([getTranslations('authPages.login'), searchParams]);
  return (
    <AuthShell
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <>
          {t('noAccount')}{' '}
          <Link
            href="/register"
            className="font-semibold text-[var(--color-primary)] transition-opacity hover:opacity-80"
          >
            {t('createAccount')}
          </Link>
        </>
      }
    >
      {query.error === 'auth_failed' && (
        <div className="mb-6"><AuthErrorBanner message={t('callbackError')} /></div>
      )}
      <LoginForm />
    </AuthShell>
  );
}
