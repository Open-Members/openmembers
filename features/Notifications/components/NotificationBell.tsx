'use client';

import { useState, useEffect, useRef, useId, useTransition } from 'react';
import { Bell, X } from 'lucide-react';
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/core/i18n/routing';
import { normalizePublicUrl } from '@/core/security/public-url';
import { useUser } from '@/core/supabase/UserProvider';
import { useIsMounted } from '@/shared/hooks/useIsMounted';
import { fetchNotifications, fetchUnreadCount } from '../queries';
import { markAllNotificationsRead, markNotificationRead, deleteNotification } from '../actions';
import type { Notification } from '@/shared/types/interfaces';
import { notificationErrorCode, type NotificationErrorCode } from '../errors';
import { notificationTimeAgo } from '../formatting';
import { NotificationItem } from './NotificationItem';
export { NotificationIcon, iconBgColor } from './notification-icons';

const POLL_INTERVAL_MS = 30_000;
interface NotificationBellProps { className?: string }

export function NotificationBell(props: NotificationBellProps) {
  const { userId } = useUser();
  return <UserNotificationBell key={userId ?? 'anonymous'} {...props} userId={userId} />;
}

function UserNotificationBell({ className, userId }: NotificationBellProps & { userId: string | null }) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const isMounted = useIsMounted();
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [countError, setCountError] = useState(false);
  const [error, setError] = useState<NotificationErrorCode | null>(null);
  const [retry, setRetry] = useState(0);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const countVersion = useRef(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const refreshCount = () => {
      const version = ++countVersion.current;
      void fetchUnreadCount(userId).then(count => {
        if (!cancelled && version === countVersion.current) { setUnread(count); setCountError(false); }
      }).catch(() => {
        if (!cancelled && version === countVersion.current) setCountError(true);
      });
    };
    refreshCount();
    const timer = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [userId, retry]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    async function load() {
      let data: Notification[];
      try { data = await fetchNotifications(userId!); }
      catch {
        if (!cancelled) { setLoadError(true); setLoading(false); }
        return;
      }
      if (cancelled) return;
      try {
        const result = await markAllNotificationsRead();
        if (cancelled) return;
        if (result.success) {
          countVersion.current += 1;
          setUnread(0);
          setCountError(false);
          data = data.map(n => ({ ...n, isRead: true }));
        } else setError(notificationErrorCode(result.error, 'readAllFailed'));
      } catch { if (!cancelled) setError('readAllFailed'); }
      if (!cancelled) { setNotifications(data); setLoadError(false); setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [open, userId, retry]);

  function closePanel(returnFocus = false) { setOpen(false); if (returnFocus) triggerRef.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    function outside(event: MouseEvent) { if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } }
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  function togglePanel() {
    if (!open) { setLoading(Boolean(userId)); setError(null); setLoadError(false); }
    setOpen(!open);
  }
  function retryLoad() { setLoading(Boolean(userId)); setError(null); setLoadError(false); setRetry(previous => previous + 1); }
  function handleOpen(n: Notification) {
    setError(null);
    startTransition(async () => {
      try {
        if (!n.isRead) {
          const result = await markNotificationRead(n.id);
          if (!isMounted()) return;
          if (!result.success) { setError(notificationErrorCode(result.error, 'readFailed')); return; }
          setNotifications(previous => previous.map(item => item.id === n.id ? { ...item, isRead: true } : item));
          countVersion.current += 1;
          setUnread(previous => Math.max(0, previous - 1));
        }
        if (n.actionUrl) {
          const destination = normalizePublicUrl(n.actionUrl);
          if (destination?.startsWith('https://')) {
            setOpen(false);
            window.location.assign(destination);
          } else if (destination?.startsWith('/')) {
            setOpen(false);
            router.push(destination as never);
          }
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
        setNotifications(previous => previous.filter(item => item.id !== n.id));
        if (!n.isRead) { countVersion.current += 1; setUnread(previous => Math.max(0, previous - 1)); }
      } catch { if (isMounted()) setError('deleteFailed'); }
    });
  }
  return <div className="relative" ref={panelRef}>
    <button ref={triggerRef} type="button" onClick={togglePanel} disabled={pending && !open} aria-label={t('title')} aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors hover:bg-[var(--color-muted)] ${className ?? ''}`}>
      <Bell className="w-5 h-5 text-[var(--color-muted-foreground)]" />
      {unread > 0 && <span aria-label={t('unreadCount', { count: unread })} className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold leading-none tabular-nums">{unread > 99 ? t('badgeOverflow') : format.number(unread)}</span>}
    </button>
    {open && <div id={panelId} role="dialog" aria-label={t('title')} className="fixed right-3 left-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-11 z-50 sm:w-[360px] max-h-[min(520px,80dvh)] overflow-hidden rounded-2xl bg-[var(--color-background)] shadow-xl border border-[var(--color-border)] flex flex-col">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--color-border)]">
        <span className="font-display text-base font-semibold tracking-tight text-[var(--color-foreground)]">{t('title')}</span>
        <button type="button" onClick={() => closePanel(true)} aria-label={t('close')} className="p-1 rounded-full hover:bg-[var(--color-muted)]"><X className="w-4 h-4" /></button>
      </div>
      {error && <div className="p-4 space-y-2"><p role="alert" className="text-sm text-red-700 dark:text-red-300">{t(`errors.${error}`)}</p>{error === 'readAllFailed' && <button type="button" disabled={loading || pending} onClick={retryLoad} className="text-sm font-semibold text-[var(--color-primary)]">{t('retry')}</button>}</div>}
      {countError && !loadError && !error && <p role="alert" className="px-4 pt-3 text-sm text-red-700 dark:text-red-300">{t('errors.countFailed')}</p>}
      <div className="flex-1 overflow-y-auto">
        {loading ? <div role="status" aria-label={t('loading')} className="p-4 space-y-3 animate-pulse"><div className="h-10 rounded bg-[var(--color-muted)]" /><div className="h-10 rounded bg-[var(--color-muted)]" /></div>
          : loadError ? <div className="p-4 space-y-3"><p role="alert" className="text-sm text-red-700 dark:text-red-300">{t('errors.loadFailed')}</p><button type="button" onClick={retryLoad} className="text-sm font-semibold text-[var(--color-primary)]">{t('retry')}</button></div>
            : notifications.length === 0 ? <div className="flex flex-col items-center justify-center py-14 px-4 text-center"><Bell aria-hidden="true" className="w-10 h-10 text-[var(--color-muted-foreground)] mb-3 opacity-40" /><p className="font-display text-base font-semibold">{t('bellEmptyTitle')}</p><p className="text-xs text-[var(--color-muted-foreground)] mt-1.5 max-w-[240px] leading-relaxed">{t('bellEmptyDescription')}</p></div>
              : <ul>{notifications.map(n => <NotificationItem key={n.id} notification={n} compact time={notificationTimeAgo(n.createdAt, now, locale, t('justNow'), t('unknownDate'))} disabled={pending} onOpen={handleOpen} onDelete={handleDelete} />)}</ul>}
      </div>
      <Link href="/notifications" onClick={() => closePanel()} className="border-t border-[var(--color-border)] py-3 text-center text-xs font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors">{t('viewAll')}</Link>
    </div>}
  </div>;
}
