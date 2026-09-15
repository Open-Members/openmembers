'use client';

import { Eye } from 'lucide-react';
import { motion, LayoutGroup } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/core/i18n/routing';
import { cn } from '@/shared/lib/utils';
import { EASE } from '@/shared/motion/constants';
import { adminNavGroups, isAdminLinkActive } from './adminNav';

export function AdminSidebar() {
  const pathname = usePathname();
  const t = useTranslations('navigation');

  return (
    <aside
      aria-label={t('adminNavigation')}
      className="hidden md:flex sticky top-16 self-start h-[calc(100vh-4rem)] w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-background)]"
    >
      {/* LayoutGroup lets the shared-id motion spans travel between nav
          groups (Overview → Learning → Audience → …) in a single spring
          sweep, instead of restarting per group. */}
      <LayoutGroup id="admin-sidebar">
        <nav className="flex-1 overflow-y-auto px-3 py-5 flex flex-col gap-5">
          {adminNavGroups.map((group) => (
            <div key={group.labelKey} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)]">
                {t(group.labelKey)}
              </p>
              {group.items.map(({ href, icon: Icon, labelKey }) => {
                const active = isAdminLinkActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                      active
                        ? 'text-[var(--color-foreground)]'
                        : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/60 hover:text-[var(--color-foreground)]',
                    )}
                  >
                    {active && (
                      <>
                        <motion.span
                          layoutId="admin-sidebar-pill"
                          aria-hidden
                          className="absolute inset-0 rounded-lg bg-[var(--color-muted)]"
                          transition={EASE.spring}
                        />
                        <motion.span
                          layoutId="admin-sidebar-bar"
                          aria-hidden
                          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-[var(--color-primary)]"
                          transition={EASE.spring}
                        />
                      </>
                    )}
                    <Icon className="relative z-10 w-4 h-4 shrink-0" />
                    <span className="relative z-10 truncate">{t(labelKey)}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </LayoutGroup>

      <div className="shrink-0 border-t border-[var(--color-border)] p-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition"
        >
          <Eye className="w-4 h-4 shrink-0" />
          {t('viewAsStudent')}
        </Link>
      </div>
    </aside>
  );
}
