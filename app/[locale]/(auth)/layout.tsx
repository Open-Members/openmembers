import {
  AuthGradientBackdrop,
} from '@/features/Auth/components/shared';
import { AuthLogo } from '@/features/Auth/components/shared/AuthLogo';
import { SiteFooter } from '@/shared/components/ui/SiteFooter';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--color-background)]">
      <AuthGradientBackdrop />
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
