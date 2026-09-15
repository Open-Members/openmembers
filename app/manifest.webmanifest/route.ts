import { cookies, headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getInstallationConfig } from '@/core/config/installation.server';
import { getTenantSettings } from '@/core/theme/settings';
import { createInstallationManifest } from '@/core/theme/presentation';
import { negotiateLocale } from '@/core/i18n/negotiation';
import { getPreferredLocale } from '@/core/i18n/preference.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [settings, config, cookieStore, requestHeaders] = await Promise.all([
    getTenantSettings(), getInstallationConfig(), cookies(), headers(),
  ]);
  // This URL is excluded from the locale proxy; use the same account-first
  // precedence with explicit visitor negotiation. Never cache across users.
  const locale = await getPreferredLocale(negotiateLocale(
    cookieStore.get('NEXT_LOCALE')?.value,
    requestHeaders.get('accept-language'),
  ));
  const t = await getTranslations({ locale, namespace: 'landing' });
  return Response.json({ ...createInstallationManifest(settings, config, t('metadataDescription')), lang: locale }, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'private, no-store',
      'Vary': 'Cookie, Accept-Language',
    },
  });
}
