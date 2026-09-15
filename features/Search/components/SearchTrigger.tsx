'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from '@/core/i18n/routing';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SearchPalette } from './SearchPalette';
import { AdminCommandPalette } from '@/features/Admin/components/AdminCommandPalette';

interface SearchTriggerProps {
  className?: string;
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

/**
 * Single ⌘K entry point. Routes between two palettes based on the
 * current path:
 *   - /admin/*   → AdminCommandPalette (navigate + quick actions)
 *   - elsewhere  → SearchPalette (course/lesson content search)
 *
 * Keeps the same visible button + shortcut so muscle memory survives
 * the context switch when an admin moves between member view and
 * /admin pages.
 */
const subscribePlatform = () => () => {};
const getServerPlatform = () => false;

export function SearchTrigger(props: SearchTriggerProps) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  return <ContextSearchTrigger key={isAdmin ? 'admin' : 'member'} {...props} isAdmin={isAdmin} />;
}

function ContextSearchTrigger({ className, isAdmin }: SearchTriggerProps & { isAdmin: boolean }) {
  const t = useTranslations('navigation');
  const [open, setOpen] = useState(false);
  const isMac = useSyncExternalStore(subscribePlatform, detectMac, getServerPlatform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isShortcut =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (!isShortcut) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t(isAdmin ? 'commands.open' : 'search')}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-2.5 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:border-[var(--color-primary)]/30 transition',
          className,
        )}
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">
          {t(isAdmin ? 'commands.trigger' : 'search')}
        </span>
        <kbd className="hidden lg:inline-flex min-w-[1.25rem] justify-center rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1 py-0.5 font-mono text-[10px]">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      {isAdmin ? (
        <AdminCommandPalette open={open} onClose={() => setOpen(false)} />
      ) : (
        <SearchPalette open={open} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
