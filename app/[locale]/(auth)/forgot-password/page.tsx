import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@/core/i18n/routing';
import ForgotPasswordForm from '@/features/Auth/components/ForgotPasswordForm';
import { AuthShell } from '@/features/Auth/components/shared';
import { getTenantSettings } from '@/core/theme/settings';

export async function generateMetadata(): Promise<Metadata> {
  const [settings, t] = await Promise.all([getTenantSettings(), getTranslations('authPages.forgotPassword')]);
  return {
    title: t('metadataTitle', { siteName: settings.site_name }),
    description: t('metadataDescription'),
  };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('authPages.forgotPassword');
  return (
    <AuthShell
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-primary)] transition-opacity hover:opacity-80"
        >
          <ArrowLeft size={14} />
          {t('backToSignIn')}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
