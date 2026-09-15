'use client';

import { useUser } from '@/core/supabase/UserProvider';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import type { CustomMenuItem } from '@/features/Navigation/types';

type NavShellProps = {
  siteName?: string;
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  customMenuItems?: CustomMenuItem[];
};

/**
 * Thin client wrapper that reads the current avatar and renders the
 * horizontal top nav (desktop + mobile) plus the mobile bottom nav.
 */
export function NavShell({
  siteName,
  logoLightUrl,
  logoDarkUrl,
  customMenuItems,
}: NavShellProps = {}) {
  const { avatarUrl } = useUser();

  return (
    <>
      <TopNav
        avatarUrl={avatarUrl}
        siteName={siteName}
        logoLightUrl={logoLightUrl}
        logoDarkUrl={logoDarkUrl}
        customMenuItems={customMenuItems}
      />
      <BottomNav avatarUrl={avatarUrl} customMenuItems={customMenuItems} />
    </>
  );
}
