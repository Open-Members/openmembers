import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/core/supabase/server';
import ChangePasswordForm from '@/features/Auth/components/ChangePasswordForm';
import { AuthShell } from '@/features/Auth/components/shared';
import { getTenantSettings } from '@/core/theme/settings';

export async function generateMetadata(): Promise<Metadata> {
  const [settings, t] = await Promise.all([getTenantSettings(), getTranslations('authPages.changePassword')]);
  return {
    title: t('metadataTitle', { siteName: settings.site_name }),
    description: t('metadataDescription'),
  };
}

export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const t = await getTranslations('authPages.changePassword');

  return (
    <AuthShell
      title={t('title')}
      subtitle={t('subtitle')}
    >
      <ChangePasswordForm />
    </AuthShell>
  );
}
