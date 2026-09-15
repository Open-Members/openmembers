'use client';

import { useEffect, useState, useTransition } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/core/i18n/routing';
import { normalizePublicUrl } from '@/core/security/public-url';
import { markAllNotificationsRead, markNotificationRead, deleteNotification } from '../actions';
import type { Notification } from '@/shared/types/interfaces';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { useIsMounted } from '@/shared/hooks/useIsMounted';
import { useBrowserTimezone } from '@/shared/hooks/useBrowserTimezone';
import { notificationErrorCode, type NotificationErrorCode } from '../errors';
import { notificationDay, notificationTime } from '../formatting';
import { NotificationItem } from './NotificationItem';

const FILTERS = ['all', 'announcement', 'new_course', 'new_lesson', 'drip_unlock', 'comment_reply', 'certificate', 'enrollment'] as const;
type Filter = typeof FILTERS[number];
type Props = { initialNotifications: Notification[]; initialLoadFailed?: boolean; initialNow: string };

export function NotificationsPageClient({ initialNotifications, initialLoadFailed = false, initialNow }: Props) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const format = useFormatter();
  const timeZone = useBrowserTimezone() ?? 'UTC';
  const router = useRouter();
  const isMounted = useIsMounted();
  const [items, setItems] = useState(initialNotifications);
  const [now, setNow] = useState(() => new Date(initialNow));
  const [filter, setFilter] = useState<Filter>('all');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<NotificationErrorCode | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const filtered = filter === 'all' ? items : items.filter(n => n.type === filter);
  const groups: Array<{ key: string; label: string; items: Notification[] }> = [];
  const groupIndex = new Map<string, number>();
  for (const n of filtered) {
    const { key, label } = notificationDay(n.createdAt, now, locale, timeZone, { today: t('today'), yesterday: t('yesterday'), unknownDate: t('unknownDate') });
    if (!groupIndex.has(key)) { groupIndex.set(key, groups.length); groups.push({ key, label, items: [] }); }
    groups[groupIndex.get(key)!].items.push(n);
  }
  const unread = items.filter(n => !n.isRead).length;

  function handleOpen(n: Notification) {
    setError(null);
    startTransition(async () => {
      try {
        if (!n.isRead) {
          const result = await markNotificationRead(n.id);
          if (!isMounted()) return;
          if (!result.success) { setError(notificationErrorCode(result.error, 'readFailed')); return; }
          setItems(previous => previous.map(item => item.id === n.id ? { ...item, isRead: true } : item));
        }
        if (n.actionUrl) {
          const destination = normalizePublicUrl(n.actionUrl);
          if (destination?.startsWith('https://')) window.location.assign(destination);
          else if (destination?.startsWith('/')) router.push(destination as never);
        }
      } catch { if (isMounted()) setError('readFailed'); }
    });
  }
  function handleDelete(n: Notification) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteNotification(n.id);
        if (!isMounted()) return;
        if (!result.success) { setError(notificationErrorCode(result.error, 'deleteFailed')); return; }
        setItems(previous => previous.filter(item => item.id !== n.id));
      } catch { if (isMounted()) setError('deleteFailed'); }
    });
  }
  function handleMarkAll() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await markAllNotificationsRead();
        if (!isMounted()) return;
        if (!result.success) { setError(notificationErrorCode(result.error, 'readAllFailed')); return; }
        setItems(previous => previous.map(item => ({ ...item, isRead: true })));
      } catch { if (isMounted()) setError('readAllFailed'); }
    });
  }
  return <div className="max-w-3xl mx-auto w-full pb-16">
    <div className="mb-8 md:mb-10 flex flex-col gap-4">
      <div>
        <p className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-2">{t('inbox')}</p>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="font-display text-3xl md:text-4xl font-medium text-[var(--color-foreground)] leading-[1.1] tracking-tight">{t('title')}</h1>
          {unread > 0 && <button type="button" onClick={handleMarkAll} disabled={pending} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-1.5 text-xs font-semibold hover:bg-[var(--color-muted)] disabled:opacity-60">
            {pending && <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />}{t('markAll')}
          </button>}
        </div>
      </div>
      {!initialLoadFailed && <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
        {FILTERS.map(value => {
          const count = value === 'all' ? items.length : items.filter(n => n.type === value).length;
          if (value !== 'all' && count === 0) return null;
          const active = value === filter;
          return <button key={value} type="button" aria-pressed={active} onClick={() => setFilter(value)} className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${active ? 'bg-[var(--color-foreground)] text-[var(--color-background)]' : 'border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'}`}>
            {t(`filters.${value}`)}<span className="tabular-nums text-[10px] opacity-70">{format.number(count)}</span>
          </button>;
        })}
      </div>}
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-300">{t(`errors.${error}`)}</p>}
    {initialLoadFailed ? <div className="space-y-3">
      <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t('errors.loadFailed')}</p>
      <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="text-sm font-semibold text-[var(--color-primary)] disabled:opacity-60">{t('retry')}</button>
    </div> : filtered.length === 0 ? <EmptyState icon={Bell} title={t('emptyTitle')} description={filter === 'all' ? t('emptyDescription') : t('emptyCategory')} />
      : <div className="space-y-8">{groups.map(group => <section key={group.key}>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-3">{group.label}</h2>
        <ul className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">{group.items.map(n => <NotificationItem key={n.id} notification={n} time={notificationTime(n.createdAt, locale, timeZone, t('unknownDate'))} disabled={pending} onOpen={handleOpen} onDelete={handleDelete} />)}</ul>
      </section>)}</div>}
  </div>;
}
