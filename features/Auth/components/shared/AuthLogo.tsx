import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';
import { getTenantSettings } from '@/core/theme/settings';
import { DefaultBrandWordmark } from '@/shared/components/ui/DefaultBrandWordmark';

// Installation logos take precedence over the product artwork or site-name fallback.
export async function AuthLogo() {
  const [settings, t] = await Promise.all([getTenantSettings(), getTranslations('landing')]);
  const siteName = settings.site_name;
  const logoLight =
    settings.logo_light_url ?? settings.logo_dark_url ?? settings.logo_url;
  const logoDark =
    settings.logo_dark_url ?? settings.logo_light_url ?? settings.logo_url;

  return (
    <Link
      href="/"
      aria-label={t('homeLabel', { siteName })}
      className="inline-flex items-center"
    >
      {logoLight || logoDark ? (
        <>
          {logoLight && (
            <Image
              src={logoLight}
              alt={siteName}
              width={180}
              height={44}
              className="h-10 w-auto dark:hidden"
              unoptimized
              priority
            />
          )}
          {logoDark && (
            <Image
              src={logoDark}
              alt={siteName}
              width={180}
              height={44}
              className="hidden h-10 w-auto dark:block"
              unoptimized
              priority
            />
          )}
        </>
      ) : siteName === 'Open Members' ? (
        <DefaultBrandWordmark className="w-[230px] max-w-full" />
      ) : (
        <span className="font-display text-2xl font-semibold tracking-tight text-[var(--color-foreground)]">
          {siteName}
        </span>
      )}
    </Link>
  );
}
