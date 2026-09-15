import { normalizePublicUrl } from '@/core/security/public-url';
import type { TenantSettings } from '@/core/theme/settings';
import { getEmailColors } from './templates/shared/branding';

/** Email clients need absolute asset/link URLs, including for repo-local branding. */
export function absoluteEmailUrl(value: unknown, siteUrl: string, allowContact = false): string | null {
  const normalized = normalizePublicUrl(value, { allowContact });
  if (!normalized) return null;
  if (!normalized.startsWith('/')) return normalized;
  const base = normalizePublicUrl(siteUrl);
  if (!base || base.startsWith('/')) return null;
  return new URL(normalized, base).toString();
}

export function getEmailBranding(
  settings: Pick<TenantSettings, 'site_name' | 'logo_light_url' | 'logo_url' | 'logo_dark_url' | 'primary_color'>,
  siteUrl: string,
) {
  return {
    siteName: settings.site_name,
    logoUrl: [settings.logo_light_url, settings.logo_url, settings.logo_dark_url]
      .map((value) => absoluteEmailUrl(value, siteUrl))
      .find(Boolean) ?? null,
    primaryColor: getEmailColors(settings.primary_color).primary,
  };
}

export function resolveMembershipEmailLinks(
  links: { community?: string | null; help?: string | null; support?: string | null },
  siteUrl: string,
) {
  return {
    whatsappUrl: absoluteEmailUrl(links.community, siteUrl)
      ?? absoluteEmailUrl(process.env.MEMBERSHIP_COMMUNITY_URL, siteUrl)
      ?? '',
    questionFormUrl: absoluteEmailUrl(links.help, siteUrl, true)
      ?? absoluteEmailUrl(links.support, siteUrl, true)
      ?? absoluteEmailUrl(process.env.MEMBERSHIP_HELP_URL, siteUrl, true)
      ?? '',
  };
}
