import { redirect } from 'next/navigation';
import { createClient } from '@/core/supabase/server';
import { NavShell } from '@/shared/components/navigation/NavShell';
import { UserProvider } from '@/core/supabase/UserProvider';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { getTenantSettings } from '@/core/theme/settings';
import { getCustomMenuItems } from '@/features/Navigation/queries.server';
import { SiteFooter } from '@/shared/components/ui/SiteFooter';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Force first-login password change flow. Webhook enrollment flips
  // must_change_password=true when it provisions a user with a temp
  // password; we keep bouncing them here until they set a real one.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('status, must_change_password')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile) throw new Error('Account profile is unavailable.');
  if (profile.status !== 'active') redirect('/suspended');
  if (profile.must_change_password) {
    redirect('/change-password');
  }

  const [settings, customMenuItems] = await Promise.all([
    getTenantSettings(),
    getCustomMenuItems(),
  ]);

  return (
    <UserProvider>
      <div className="flex flex-col min-h-screen">
        <NavShell
          siteName={settings.site_name}
          logoLightUrl={settings.logo_light_url ?? settings.logo_url}
          logoDarkUrl={settings.logo_dark_url ?? settings.logo_url}
          customMenuItems={customMenuItems}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0 focus:outline-none"
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
        <SiteFooter />
      </div>
    </UserProvider>
  );
}
