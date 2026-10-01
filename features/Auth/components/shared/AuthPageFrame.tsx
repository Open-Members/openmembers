import type { ReactNode } from 'react';
import { getTenantSettings } from '@/core/theme/settings';
import { EntryBackgroundLayer, entrySurfaceStyle, entryBrandSurface } from '@/shared/components/ui/EntryBackground';
import { SiteFooter } from '@/shared/components/ui/SiteFooter';
import { AuthGradientBackdrop } from './AuthGradientBackdrop';
import { AuthLogo } from './AuthLogo';

export async function AuthPageFrame({
  screen,
  children,
}: {
  screen: 'login' | 'register' | 'legacy';
  children: ReactNode;
}) {
  const settings = screen === 'legacy' ? null : await getTenantSettings();
  const background =
    screen === 'login'
      ? settings!.login_background
      : screen === 'register'
        ? settings!.register_background
        : null;
  return (
    <main
      data-entry-screen={screen}
      data-entry-brand-surface={entryBrandSurface(background)}
      data-entry-solid-background={background?.mode === 'color' ? true : undefined}
      className="relative min-h-screen overflow-hidden bg-[var(--color-background)]"
      style={entrySurfaceStyle(background)}
    >
      {background ? <EntryBackgroundLayer background={background} /> : <AuthGradientBackdrop />}
      <div className="relative flex min-h-screen flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-10 px-5 py-16 sm:px-8">
          <AuthLogo />
          {children}
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
