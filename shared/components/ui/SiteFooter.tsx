import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';
import { getTenantSettings } from '@/core/theme/settings';
import type { TenantSettings } from '@/core/theme/settings';
import { getInstallationConfig } from '@/core/config/installation.server';
import { SiteFooterVisibility } from './SiteFooterVisibility';
import { DefaultBrandWordmark } from './DefaultBrandWordmark';

// Footer-sized brand mark. Shorter than AuthLogo (which was sized for
// auth pages) and pairs with a small caption line. Kept inline so the
// component stays self-contained; split out if we ever need a third
// caller.
function FooterBrand({ settings, homeLabel }: { settings: TenantSettings; homeLabel: string }) {
  const { site_name: siteName } = settings;
  const logoLight =
    settings.logo_light_url ?? settings.logo_dark_url ?? settings.logo_url;
  const logoDark =
    settings.logo_dark_url ?? settings.logo_light_url ?? settings.logo_url;

  // When we render a graphic logo, showing the site name AGAIN below it
  // would be noisy — skip the caption. When we fall back to the text
  // wordmark, the wordmark already IS the brand so we also skip the
  // caption. The caption only shows when the image doesn't already
  // repeat the name (future: tagline field).
  const hasImage = Boolean(logoLight || logoDark);

  return (
    <div className="flex flex-col items-center gap-1.5 md:items-start">
      <Link
        href="/"
        aria-label={homeLabel}
        className="inline-flex items-center"
      >
        {hasImage ? (
          <>
            {logoLight && (
              <Image
                src={logoLight}
                alt={siteName}
                width={140}
                height={28}
                className="h-7 w-auto dark:hidden"
                unoptimized
              />
            )}
            {logoDark && (
              <Image
                src={logoDark}
                alt={siteName}
                width={140}
                height={28}
                className="hidden h-7 w-auto dark:block"
                unoptimized
              />
            )}
          </>
        ) : siteName === 'Open Members' ? (
          <DefaultBrandWordmark className="w-[161px] max-w-full" />
        ) : (
          <span className="font-display text-lg font-semibold tracking-tight text-[var(--color-foreground)]">
            {siteName}
          </span>
        )}
      </Link>
      {hasImage && (
        <span className="text-xs font-medium text-[var(--color-muted-foreground)]">
          {siteName}
        </span>
      )}
    </div>
  );
}

export async function SiteFooter() {
  const [t, tLanding, settings, config] = await Promise.all([
    getTranslations('footer'),
    getTranslations('landing'),
    getTenantSettings(),
    getInstallationConfig(),
  ]);

  // Focus ring + underline-on-hover gives links a proper tactile feel
  // without adding decoration noise in the default state. min-h-11
  // guarantees a 44×44 tap target on mobile without bloating desktop
  // where the line-height already covers it.
  const linkClass =
    'inline-flex min-h-11 items-center px-1 text-sm font-medium text-[var(--color-muted-foreground)] underline-offset-4 transition-colors hover:text-[var(--color-foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40 focus-visible:rounded-md md:min-h-0';

  return (
    <SiteFooterVisibility>
      <footer className="mt-auto border-t border-[var(--color-border)]/60 bg-[var(--color-muted)]/30">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 md:flex-row md:items-start md:justify-between md:gap-6 md:py-8">
          <FooterBrand settings={settings} homeLabel={tLanding('homeLabel', { siteName: settings.site_name })} />

          <nav
            aria-label={t('navigationLabel')}
            className="flex flex-col items-center gap-1 md:flex-row md:items-center md:gap-x-6"
          >
            <FooterLink href={config.links.terms ?? '/terms'} className={linkClass}>
              {t('terms')}
            </FooterLink>
            <FooterLink href={config.links.privacy ?? '/privacy'} className={linkClass}>
              {t('privacy')}
            </FooterLink>
            <FooterLink href={config.links.support ?? config.links.help ?? '/support'} className={linkClass}>
              {t('support')}
            </FooterLink>
            {config.links.community && (
              <FooterLink href={config.links.community} className={linkClass}>
                {t('community')}
              </FooterLink>
            )}
          </nav>
        </div>

        <div className="mx-auto max-w-6xl px-6 pb-8 md:pb-6">
          <small className="block text-center text-xs text-[var(--color-muted-foreground)] md:text-right">
            {t('copyright', {
              year: new Date().getFullYear(),
              siteName: settings.site_name,
            })}
          </small>
        </div>
      </footer>
    </SiteFooterVisibility>
  );
}

function FooterLink({ href, className, children }: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  return href.startsWith('/') ? (
    <Link href={href} prefetch={false} className={className}>{children}</Link>
  ) : (
    <a href={href} className={className}>{children}</a>
  );
}
