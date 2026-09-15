'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Link, usePathname } from '@/core/i18n/routing';
import {
  LayoutDashboard,
  BookOpen,
  TrendingUp,
  Settings,
  CircleUser,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Eye,
  Menu,
  X,
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { cn } from '@/shared/lib/utils';
import { DURATION, EASE } from '@/shared/motion/constants';
import { useUser } from '@/core/supabase/UserProvider';
import { useTranslations } from 'next-intl';
import { AuthErrorBanner } from '@/features/Auth/components/shared/AuthErrorBanner';
import { signOutAndNavigate } from '@/features/Auth/components/shared/signOut';
import { useAuthAction } from '@/features/Auth/components/shared/useAuthAction';
import { ThemeToggle } from '@/shared/components/ui/ThemeToggle';
import { NotificationBell } from '@/features/Notifications/components/NotificationBell';
import { SearchTrigger } from '@/features/Search/components/SearchTrigger';
import { DefaultBrandWordmark } from '@/shared/components/ui/DefaultBrandWordmark';
import {
  isExternalUrl,
  type CustomMenuItem,
} from '@/features/Navigation/types';
import { MenuIcon } from '@/features/Navigation/components/MenuIcon';
import { adminNavGroups, isAdminLinkActive } from './adminNav';

const studentNavItems = [
  { href: '/dashboard' as const, icon: LayoutDashboard, labelKey: 'dashboard' as const },
  { href: '/courses' as const, icon: BookOpen, labelKey: 'courses' as const },
  { href: '/progress' as const, icon: TrendingUp, labelKey: 'progress' as const },
];

interface TopNavProps {
  avatarUrl?: string | null;
  siteName?: string;
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  customMenuItems?: CustomMenuItem[];
}

export function TopNav(props: TopNavProps) {
  const pathname = usePathname();
  return <RouteTopNav key={pathname} {...props} pathname={pathname} />;
}

function RouteTopNav({
  pathname,
  avatarUrl,
  siteName,
  logoLightUrl,
  logoDarkUrl,
  customMenuItems = [],
}: TopNavProps & { pathname: string }) {
  const { role, user } = useUser();
  const t = useTranslations('navigation');
  const { error, isPending, run } = useAuthAction();
  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email ??
    t('account');
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isAdmin = role === 'admin' || role === 'super_admin';
  const inAdminMode = pathname.startsWith('/admin');

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  // Close admin drawer on ESC
  useEffect(() => {
    if (!adminDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAdminDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adminDrawerOpen]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!adminDrawerOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [adminDrawerOpen]);

  async function handleLogout() {
    await run(signOutAndNavigate);
  }

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="flex items-stretch justify-between gap-4 px-4 md:px-6 lg:px-8 h-14 md:h-16">
        {/* ── Logo ─────────────────────────────────────── */}
        <Link
          href="/dashboard"
          className="flex items-center self-center shrink-0"
          aria-label={siteName ?? t('home')}
        >
          {logoLightUrl || logoDarkUrl ? (
            <div className="max-w-[120px] md:max-w-[160px] h-8 md:h-9 relative">
              {logoLightUrl && (
                <Image
                  src={logoLightUrl}
                  alt={siteName ?? t('logo')}
                  width={160}
                  height={36}
                  className="h-full w-auto object-contain dark:hidden"
                  unoptimized
                  priority
                />
              )}
              {logoDarkUrl && (
                <Image
                  src={logoDarkUrl}
                  alt={siteName ?? t('logo')}
                  width={160}
                  height={36}
                  className="h-full w-auto object-contain hidden dark:block"
                  unoptimized
                  priority
                />
              )}
              {/* Fallbacks when only one variant is set */}
              {logoLightUrl && !logoDarkUrl && (
                <Image
                  src={logoLightUrl}
                  alt={siteName ?? t('logo')}
                  width={160}
                  height={36}
                  className="h-full w-auto object-contain hidden dark:block"
                  unoptimized
                />
              )}
              {!logoLightUrl && logoDarkUrl && (
                <Image
                  src={logoDarkUrl}
                  alt={siteName ?? t('logo')}
                  width={160}
                  height={36}
                  className="h-full w-auto object-contain dark:hidden"
                  unoptimized
                />
              )}
            </div>
          ) : (siteName ?? 'Open Members') === 'Open Members' ? (
            <DefaultBrandWordmark className="w-8 sm:w-[184px]" compactOnMobile />
          ) : (
            <span className="text-lg md:text-xl font-extrabold tracking-tight text-[var(--color-foreground)]">
              {siteName ?? 'Open Members'}
            </span>
          )}
        </Link>

        {/* ── Hamburger (mobile, admin-only) — opens section drawer ── */}
        {isAdmin && inAdminMode && (
          <button
            type="button"
            onClick={() => setAdminDrawerOpen(true)}
            className="md:hidden -ml-2 flex items-center justify-center self-center w-10 h-10 rounded-lg text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition"
            aria-label={t('openAdminMenu')}
            aria-expanded={adminDrawerOpen}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* ── Nav links (desktop) — student only; admin uses AdminSidebar.
             LayoutGroup wraps every link so the underline slides between
             sections with a shared layoutId (Linear / Fluency feel). */}
        {!inAdminMode && (
          <LayoutGroup id="topnav">
            <nav className="hidden md:flex items-stretch gap-0 flex-1 ml-4 -mb-px">
              {studentNavItems.map(({ href, icon: Icon, labelKey }) => {
                const active =
                  pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'relative flex items-center gap-2 px-3 text-sm font-semibold transition-colors',
                      active
                        ? 'text-[var(--color-foreground)]'
                        : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t(labelKey)}
                    {active && (
                      <motion.span
                        layoutId="topnav-underline"
                        aria-hidden
                        className="absolute left-0 right-0 bottom-0 h-0.5 rounded-full bg-[var(--color-primary)]"
                        transition={EASE.spring}
                      />
                    )}
                  </Link>
                );
              })}
              {customMenuItems.map((item) => (
                <CustomTopNavLink key={item.id} item={item} />
              ))}
            </nav>
          </LayoutGroup>
        )}
        {inAdminMode && <div className="hidden md:block flex-1" />}

        {/* Right-side controls are self-centered inside the stretched row */}

        {/* ── Right side ───────────────────────────────── */}
        <div className="flex items-center self-center gap-2 md:gap-3 shrink-0">
          {/* Mode switcher — admin ↔ student */}
          {isAdmin && !inAdminMode && (
            <Link
              href="/admin"
              aria-label={t('adminPanel')}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/15 transition"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('adminPanel')}</span>
            </Link>
          )}
          <SearchTrigger />

          <NotificationBell />

          {/* User menu */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={cn(
                'flex items-center gap-2 rounded-full p-1 pr-2 transition',
                menuOpen
                  ? 'bg-[var(--color-muted)]'
                  : 'hover:bg-[var(--color-muted)]',
              )}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t('accountMenu')}
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--color-muted)] flex items-center justify-center shrink-0 border border-[var(--color-border)]">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={t('profile')}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <CircleUser className="w-5 h-5 text-[var(--color-muted-foreground)]" />
                )}
              </div>
              <ChevronDown
                className={cn(
                  'hidden sm:block w-3.5 h-3.5 text-[var(--color-muted-foreground)] transition-transform',
                  menuOpen && 'rotate-180',
                )}
              />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, scale: 0.96, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -6 }}
                  transition={{ duration: DURATION.short, ease: EASE.out }}
                  style={{ transformOrigin: 'top right' }}
                  className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl overflow-hidden py-1 z-50"
                >
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-[var(--color-border)]">
                    <p className="text-sm font-bold text-[var(--color-foreground)] truncate">
                      {displayName}
                    </p>
                  </div>

                  <MenuLink href="/settings" icon={Settings}>
                    {t('settings')}
                  </MenuLink>

                  <div className="border-t border-[var(--color-border)] my-1" />

                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-sm text-[var(--color-muted-foreground)]">
                      {t('theme')}
                    </span>
                    <ThemeToggle />
                  </div>

                  <div className="border-t border-[var(--color-border)] my-1" />

                  {error && <div className="px-3 py-2"><AuthErrorBanner message={error} /></div>}

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isPending}
                    aria-busy={isPending}
                    role="menuitem"
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LogOut className="w-4 h-4" />
                    {t('signOut')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>

    {/* ── Admin mobile drawer — slides in from the right ─────────── */}
    <AnimatePresence>
      {adminDrawerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setAdminDrawerOpen(false)}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            // Swipe right past ~80px (or flick with velocity) closes the
            // drawer. Elastic only to the right — the left edge is hard
            // so users can't drag the drawer off-screen in the wrong
            // direction.
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.2 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80 || info.velocity.x > 300) {
                setAdminDrawerOpen(false);
              }
            }}
            className="md:hidden fixed top-0 right-0 bottom-0 z-50 w-[85vw] max-w-[340px] bg-[var(--color-background)] border-l border-[var(--color-border)] flex flex-col shadow-2xl touch-pan-y"
            role="dialog"
            aria-label={t('adminNavigation')}
          >
            <header className="flex items-center justify-between px-5 h-14 border-b border-[var(--color-border)] shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)]">
                {t('admin')}
              </p>
              <button
                type="button"
                onClick={() => setAdminDrawerOpen(false)}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition"
                aria-label={t('closeAdminMenu')}
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-5">
              {adminNavGroups.map((group) => (
                <div key={group.labelKey} className="flex flex-col gap-1">
                  <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)]">
                    {t(group.labelKey)}
                  </p>
                  {group.items.map(({ href, icon: Icon, labelKey }) => {
                    const active = isAdminLinkActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setAdminDrawerOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
                          active
                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                            : 'text-[var(--color-foreground)] hover:bg-[var(--color-muted)]',
                        )}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        <span className="truncate">{t(labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <footer className="border-t border-[var(--color-border)] p-3 flex flex-col gap-1 shrink-0">
              <Link
                href="/dashboard"
                onClick={() => setAdminDrawerOpen(false)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition"
              >
                <Eye className="w-5 h-5 shrink-0" />
                {t('viewAsStudent')}
              </Link>
              {error && <AuthErrorBanner message={error} />}
              <button
                type="button"
                onClick={handleLogout}
                disabled={isPending}
                aria-busy={isPending}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition text-left disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                {t('signOut')}
              </button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
    </>
  );
}

function MenuLink({
  href,
  icon: Icon,
  children,
}: {
  href: '/dashboard' | '/settings' | '/admin';
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-3 px-4 py-2 text-sm font-semibold text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition"
    >
      <Icon className="w-4 h-4 text-[var(--color-muted-foreground)]" />
      {children}
    </Link>
  );
}

function CustomTopNavLink({ item }: { item: CustomMenuItem }) {
  const classes =
    'flex items-center gap-2 px-3 text-sm font-semibold transition-colors border-b-2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border-transparent';
  const content = (
    <>
      <MenuIcon name={item.iconName} className="w-4 h-4" />
      <span className="truncate">{item.label}</span>
    </>
  );

  if (isExternalUrl(item.url)) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className={classes}>
        {content}
      </a>
    );
  }
  return (
    <a href={item.url} className={classes}>
      {content}
    </a>
  );
}
