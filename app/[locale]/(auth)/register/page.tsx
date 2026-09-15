import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';
import RegisterForm from '@/features/Auth/components/RegisterForm';
import { AuthShell } from '@/features/Auth/components/shared';
import { getTenantSettings } from '@/core/theme/settings';

export async function generateMetadata(): Promise<Metadata> {
  const [settings, t] = await Promise.all([getTenantSettings(), getTranslations('authPages.register')]);
  return {
    title: t('metadataTitle', { siteName: settings.site_name }),
    description: t('metadataDescription'),
  };
}

export default async function RegisterPage() {
  const t = await getTranslations('authPages.register');
  return (
    <AuthShell
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <>
          {t('hasAccount')}{' '}
          <Link
            href="/login"
            className="font-semibold text-[var(--color-primary)] transition-opacity hover:opacity-80"
          >
            {t('signIn')}
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
