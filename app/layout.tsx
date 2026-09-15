import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { getLocale, getTranslations } from 'next-intl/server';
import './globals.css';
import { AppToastProvider } from '@/shared/components/ui/AppToastProvider';
import { RouteProgressBar } from '@/shared/components/ui/RouteProgressBar';
import { SkipToContent } from '@/shared/components/ui/SkipToContent';
import { MotionProvider } from '@/shared/motion/MotionProvider';
import { getTenantSettings } from '@/core/theme/settings';
import { getInstallationConfig } from '@/core/config/installation.server';
import { createInstallationMetadata, createThemeCss } from '@/core/theme/presentation';
import { parseAuthOrigin } from '@/core/security/auth-redirect';

// Resolve the installation file when serving a request, including standalone
// processes that reuse one build with different installation configurations.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [settings, config, t] = await Promise.all([getTenantSettings(), getInstallationConfig(), getTranslations('landing')]);
  const origin = parseAuthOrigin(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000');
  return createInstallationMetadata(settings, config, new URL(origin), t('metadataDescription'));
}

export async function generateViewport(): Promise<Viewport> {
  const settings = await getTenantSettings();
  return { themeColor: settings.primary_color };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, locale] = await Promise.all([getTenantSettings(), getLocale()]);

  const themeCss = createThemeCss(settings);

  return (
    <html
      lang={locale}
      className="h-full dark"
      suppressHydrationWarning
    >
      <head>
        {/* Credentials preserve the account language; a changed URL refreshes the browser's manifest. */}
        <link rel="manifest" href={`/manifest.webmanifest?locale=${locale}`} crossOrigin="use-credentials" />
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        {/* Apply the saved color mode before hydration. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{if(localStorage.getItem('openmembers:theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}})()`}
        </Script>
      </head>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        <SkipToContent />
        <AppToastProvider />
        <MotionProvider>
          <RouteProgressBar style={settings.loading_bar_style} />
          {children}
        </MotionProvider>
      </body>
    </html>
  );
}
