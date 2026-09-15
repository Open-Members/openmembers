'use client';

import { usePathname } from '@/core/i18n/routing';

export function SiteFooterVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith('/admin')) return null;
  return <>{children}</>;
}
