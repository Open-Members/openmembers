import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getTenantSettings } from '@/core/theme/settings';
import { getInstallationConfig } from '@/core/config/installation.server';
import { SuspendedNotice } from '@/features/Auth/components/SuspendedNotice';

export async function generateMetadata(): Promise<Metadata> {
  const [settings, t] = await Promise.all([getTenantSettings(), getTranslations('authPages.suspended')]);
  return { title: t('metadataTitle', { siteName: settings.site_name }), description: t('metadataDescription') };
}

export default async function SuspendedPage() {
  const config = await getInstallationConfig();
  const contactUrl = config.links.help ?? config.links.support;
  // Internal member support needs an active account and would send this user
  // straight back here. Keep the organization contact instruction instead.
  const accessibleContactUrl = contactUrl && !/^\/(?:[a-z]{2}\/)?(?:support|suspended)(?:[/?#]|$)/i.test(contactUrl)
    ? contactUrl
    : null;

  return <SuspendedNotice contactUrl={accessibleContactUrl} />;
}
