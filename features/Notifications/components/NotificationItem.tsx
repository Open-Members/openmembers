'use client';

import { Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { resolveNotificationContent } from '@/core/notifications/messages';
import type { Notification } from '@/shared/types/interfaces';
import { NotificationIcon, iconBgColor } from './notification-icons';

export function NotificationItem({ notification: n, time, compact = false, disabled, onOpen, onDelete }: {
  notification: Notification; time: string; compact?: boolean; disabled: boolean;
  onOpen: (notification: Notification) => void; onDelete: (notification: Notification) => void;
}) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const content = resolveNotificationContent(n, locale);
  return <li className={`group flex items-start gap-2 px-3 py-3 sm:px-5 border-b border-[var(--color-border)] last:border-0 transition-colors hover:bg-[var(--color-muted)] ${!n.isRead ? 'bg-[var(--color-primary)]/[0.04]' : ''}`}>
    <button type="button" disabled={disabled} onClick={() => onOpen(n)} className="flex flex-1 min-w-0 items-start gap-3 text-left rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-60">
      <span aria-hidden="true" className={`w-10 h-10 rounded-full ${iconBgColor(n.type)} shrink-0 flex items-center justify-center shadow-sm`}><NotificationIcon type={n.type} /></span>
      <span className="flex-1 min-w-0 break-words">
        {content.title && <span className={`block font-display font-semibold tracking-tight text-[var(--color-foreground)] leading-snug ${compact ? 'text-sm' : 'text-base'}`}>{content.title}</span>}
        <span className={`block text-sm text-[var(--color-muted-foreground)] leading-relaxed ${content.title ? 'mt-1' : ''} ${compact ? 'line-clamp-2' : ''}`}>{content.message}</span>
        <span className="block text-[11px] text-[var(--color-muted-foreground)] mt-1.5 tabular-nums">{time}</span>
        {!n.isRead && <span className="sr-only">{t('unread')}</span>}
      </span>
    </button>
    <div className="shrink-0 mt-1 flex items-center gap-1">
      {!n.isRead && <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />}
      <button type="button" onClick={() => onDelete(n)} disabled={disabled} aria-label={t('delete')} className="flex items-center justify-center w-7 h-7 rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-border)] hover:text-[var(--color-foreground)] transition disabled:opacity-60">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  </li>;
}
