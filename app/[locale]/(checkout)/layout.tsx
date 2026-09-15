import { getTranslations } from 'next-intl/server';
import { Link } from '@/core/i18n/routing';
import { AuthLogo } from '@/features/Auth/components/shared/AuthLogo';
import { SiteFooter } from '@/shared/components/ui/SiteFooter';

/**
 * Minimal chrome for post-checkout pages (e.g. /thank-you).
 *
 * Deliberately NOT the marketing PublicNavbar — a buyer who just paid has
 * no use for a "Get Started" CTA. Just the tenant logo and a single
 * "Log in" button styled like the login page's AuthButton, so the look
 * stays consistent with the rest of the platform.
 */
export default async function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations('landing.navbar');

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <header className="w-full border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <AuthLogo />
          {/* Mirrors AuthButton (features/Auth/.../AuthButton.tsx) so the CTA
              matches the login page, rendered as a Link for navigation. */}
          <Link
            href="/login"
            className="group relative inline-flex items-center justify-center overflow-hidden rounded-full px-6 py-2.5 text-sm font-semibold text-[var(--color-primary-foreground)] transition-all duration-200 ease-out hover:brightness-[1.08] active:scale-[0.985]"
            style={{
              background:
                'linear-gradient(to bottom, var(--color-primary), color-mix(in oklab, var(--color-primary) 82%, black))',
              boxShadow: [
                '0 10px 30px -8px color-mix(in oklab, var(--color-primary) 45%, transparent)',
                '0 2px 6px -2px color-mix(in oklab, var(--color-primary) 30%, transparent)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              ].join(', '),
            }}
          >
            {t('login')}
          </Link>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 focus:outline-none"
      >
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
