'use client';

import { useState } from 'react';
import { Link, usePathname } from '@/core/i18n/routing';
import { LayoutDashboard, BookOpen, TrendingUp, EllipsisVertical, Settings, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { motion, LayoutGroup, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { isExternalUrl, type CustomMenuItem } from '@/features/Navigation/types';
import { MenuIcon } from '@/features/Navigation/components/MenuIcon';

const navItems = [
  { href: '/dashboard' as const, icon: LayoutDashboard, labelKey: 'dashboard' as const },
  { href: '/courses' as const, icon: BookOpen, labelKey: 'courses' as const },
  { href: '/progress' as const, icon: TrendingUp, labelKey: 'progress' as const },
];

const moreItems = [
  { href: '/settings' as const, icon: Settings, labelKey: 'settings' as const },
];

interface BottomNavProps {
  avatarUrl?: string | null;
  customMenuItems?: CustomMenuItem[];
}

export function BottomNav({
  customMenuItems = [],
}: BottomNavProps = {}) {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const t = useTranslations('navigation');

  const isMoreActive = pathname.startsWith('/settings');

  // Hide during lesson playback (/courses/{slug}/{lessonSlug}) for full immersion on mobile.
  const isLessonPlayer =
    pathname.startsWith('/courses/') &&
    pathname.split('/').filter(Boolean).length >= 3;
  // Hide on admin routes — admin has its own top nav and mobile bottom nav would be confusing.
  const inAdminMode = pathname.startsWith('/admin');
  if (isLessonPlayer || inAdminMode) return null;

  return (
    <>
      {/* More menu overlay */}
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="md:hidden fixed bottom-20 right-3 z-50 w-52 rounded-xl border border-[var(--color-primary)]/10 bg-[var(--color-card)] p-2 shadow-xl"
            >
              {moreItems.map(({ href, icon: Icon, labelKey }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-colors',
                      active
                        ? 'bg-[var(--color-primary-50)] text-[var(--color-primary)]'
                        : 'text-[var(--color-foreground)] hover:bg-[var(--color-primary-50)]/50',
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {t(labelKey)}
                  </Link>
                );
              })}
              {customMenuItems.map((item) => {
                const baseClasses =
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-colors text-[var(--color-foreground)] hover:bg-[var(--color-primary-50)]/50';
                const iconEl = <MenuIcon name={item.iconName} className="w-5 h-5" />;
                if (isExternalUrl(item.url)) {
                  return (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowMore(false)}
                      className={baseClasses}
                    >
                      {iconEl}
                      <span className="truncate">{item.label}</span>
                    </a>
                  );
                }
                return (
                  <a
                    key={item.id}
                    href={item.url}
                    onClick={() => setShowMore(false)}
                    className={baseClasses}
                  >
                    {iconEl}
                    <span className="truncate">{item.label}</span>
                  </a>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom navigation bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur-md">
        <LayoutGroup id="bottomnav">
          {navItems.map(({ href, icon: Icon, labelKey }) => {
            const active = pathname === href || pathname.startsWith(href + '/');

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors',
                  active
                    ? 'text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)]',
                )}
              >
                {active && (
                  <motion.div
                    layoutId="bottomnav-pill"
                    className="absolute top-1.5 h-8 w-12 rounded-full bg-[var(--color-primary-50)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}

                <motion.div
                  animate={{ scale: active ? 1.15 : 1, y: active ? -1 : 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="relative z-10"
                >
                  <Icon className="w-5 h-5" />
                </motion.div>

                <span className="relative z-10 text-[10px] leading-none">{t(labelKey)}</span>

                {active && (
                  <motion.div
                    layoutId="bottomnav-dot"
                    className="absolute bottom-1 h-1 w-4 rounded-full bg-[var(--color-primary)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(v => !v)}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors',
              isMoreActive || showMore
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-muted-foreground)]',
            )}
          >
            {(isMoreActive && !showMore) && (
              <motion.div
                layoutId="bottomnav-pill"
                className="absolute top-1.5 h-8 w-12 rounded-full bg-[var(--color-primary-50)]"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}

            <motion.div
              animate={{ scale: isMoreActive || showMore ? 1.15 : 1, y: isMoreActive || showMore ? -1 : 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="relative z-10"
            >
              {showMore ? <X className="w-5 h-5" /> : <EllipsisVertical className="w-5 h-5" />}
            </motion.div>

            <span className="relative z-10 text-[10px] leading-none">{t('more')}</span>

            {(isMoreActive && !showMore) && (
              <motion.div
                layoutId="bottomnav-dot"
                className="absolute bottom-1 h-1 w-4 rounded-full bg-[var(--color-primary)]"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        </LayoutGroup>
      </nav>
    </>
  );
}
