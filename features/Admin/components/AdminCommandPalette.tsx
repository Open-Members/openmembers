'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/core/i18n/routing';
import { useTranslations } from 'next-intl';
import {
  Search,
  X,
  ArrowRight,
  Plus,
  Eye,
  LogOut,
  Settings as SettingsIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  adminNavGroups,
  type AdminCommandGroup,
} from '@/shared/components/navigation/adminNav';
import { cn } from '@/shared/lib/utils';
import { useFocusTrap } from '@/shared/lib/useFocusTrap';
import { DURATION, EASE } from '@/shared/motion/constants';

interface Props {
  open: boolean;
  onClose: () => void;
}

type CommandIcon = React.ComponentType<{ className?: string }>;

interface Command {
  id: string;
  label: string;
  group: AdminCommandGroup;
  hint?: string;
  icon: CommandIcon;
  /** Either `href` for a route push, or `action` for an arbitrary callback. */
  href?: string;
  action?: () => void;
}

/**
 * Admin-side command palette. Opens via ⌘K when the user is in an
 * /admin route (SearchTrigger routes the shortcut). Two groups:
 *
 *  - Navigate — every admin page from adminNavGroups, plus a quick
 *    "View as student" shortcut.
 *  - Quick actions — common write operations (Create course) and
 *    settings.
 *
 * Substring-match filtering on label + group + hint. Keyboard nav with
 * Arrow Up/Down, Enter to fire, Esc to close. Animated via motion to
 * match the rest of the polish work.
 */
export function AdminCommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const t = useTranslations('navigation');
  const inputRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const navigate: Command[] = adminNavGroups.flatMap((group) =>
      group.items.map((item) => ({
        id: `nav:${item.href}`,
        label: t(item.labelKey),
        group: 'navigate' as const,
        hint: t(group.labelKey),
        icon: item.icon,
        href: item.href,
      })),
    );
    navigate.push({
      id: 'nav:view-as-student',
      label: t('viewAsStudent'),
      group: 'navigate',
      hint: t('commands.memberDashboard'),
      icon: Eye,
      href: '/dashboard',
    });

    const actions: Command[] = [
      {
        id: 'qa:create-course',
        label: t('commands.createCourse'),
        group: 'quickActions',
        hint: t('commands.contentEditor'),
        icon: Plus,
        href: '/admin/content',
      },
      {
        id: 'qa:settings',
        label: t('settings'),
        group: 'quickActions',
        hint: t('commands.profileAndAccount'),
        icon: SettingsIcon,
        href: '/settings',
      },
      {
        id: 'qa:logout',
        label: t('signOut'),
        group: 'quickActions',
        icon: LogOut,
        href: '/logout',
      },
    ];

    return [...navigate, ...actions];
  }, [t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const haystack = [c.label, t(`commands.groups.${c.group}`), c.hint ?? ''].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [query, commands, t]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Reset highlight when filter changes
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Keyboard: arrows + enter + esc. Only active when open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const c = filtered[activeIdx];
        if (c) execute(c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered, activeIdx]);

  function execute(c: Command) {
    onClose();
    if (c.action) {
      c.action();
      return;
    }
    if (c.href) router.push(c.href);
  }

  // Group rendering — preserve order: Navigate first, then Quick actions.
  // Build a flat-with-headers structure so keyboard nav stays linear.
  const grouped = useMemo(() => {
    const map = new Map<Command['group'], Command[]>();
    for (const c of filtered) {
      const arr = map.get(c.group) ?? [];
      arr.push(c);
      map.set(c.group, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.short }}
          className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            ref={trapRef}
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: DURATION.short, ease: EASE.out }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t('commands.title')}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
              <Search className="w-4 h-4 text-[var(--color-muted-foreground)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('commands.placeholder')}
                className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none"
                aria-label={t('commands.query')}
              />
              <button
                type="button"
                onClick={onClose}
                aria-label={t('commands.close')}
                className="p-1 rounded hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                  {t('commands.noMatches', { query })}
                </div>
              ) : (
                grouped.map(([groupName, items]) => {
                  // Compute starting index of this group in the flat
                  // filtered array so highlight maps correctly.
                  const startIdx = filtered.findIndex(
                    (c) => c.group === groupName,
                  );
                  return (
                    <div key={groupName} className="mb-2 last:mb-0">
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
                        {t(`commands.groups.${groupName}`)}
                      </p>
                      <ul>
                        {items.map((c, localIdx) => {
                          const flatIdx = startIdx + localIdx;
                          const active = flatIdx === activeIdx;
                          const Icon = c.icon;
                          return (
                            <li key={c.id}>
                              <button
                                type="button"
                                onMouseEnter={() => setActiveIdx(flatIdx)}
                                onClick={() => execute(c)}
                                className={cn(
                                  'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition',
                                  active
                                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-foreground)]'
                                    : 'text-[var(--color-foreground)] hover:bg-[var(--color-muted)]',
                                )}
                              >
                                <Icon
                                  className={cn(
                                    'w-4 h-4 shrink-0',
                                    active
                                      ? 'text-[var(--color-primary)]'
                                      : 'text-[var(--color-muted-foreground)]',
                                  )}
                                />
                                <span className="flex-1 text-sm font-medium truncate">
                                  {c.label}
                                </span>
                                {c.hint && (
                                  <span className="text-xs text-[var(--color-muted-foreground)] truncate">
                                    {c.hint}
                                  </span>
                                )}
                                <ArrowRight
                                  className={cn(
                                    'w-3.5 h-3.5 shrink-0 transition-opacity',
                                    active ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-[var(--color-border)] text-[10px] text-[var(--color-muted-foreground)]">
              <span className="inline-flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                {t('commands.navigateHint')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>↵</Kbd>
                {t('commands.selectHint')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>esc</Kbd>
                {t('commands.closeHint')}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] justify-center rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1 py-0.5 font-mono text-[9px] text-[var(--color-foreground)]">
      {children}
    </kbd>
  );
}
