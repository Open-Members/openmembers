import { Bell, Megaphone, BookOpen, Unlock, MessageSquare, Sparkles, PlayCircle, Award } from 'lucide-react';
import type { Notification } from '@/shared/types/interfaces';

export function NotificationIcon({ type }: { type: Notification['type'] }) {
  const base = 'w-4 h-4 text-white';
  switch (type) {
    case 'enrollment':
      return <BookOpen className={base} />;
    case 'drip_unlock':
      return <Unlock className={base} />;
    case 'comment_reply':
      return <MessageSquare className={base} />;
    case 'announcement':
      return <Megaphone className={base} />;
    case 'new_course':
      return <Sparkles className={base} />;
    case 'new_lesson':
      return <PlayCircle className={base} />;
    case 'certificate':
      return <Award className={base} />;
    default:
      return <Bell className={base} />;
  }
}

export function iconBgColor(type: Notification['type']): string {
  switch (type) {
    case 'enrollment':
      return 'bg-emerald-500';
    case 'drip_unlock':
      return 'bg-sky-500';
    case 'comment_reply':
      return 'bg-orange-500';
    case 'announcement':
      return 'bg-[var(--color-primary)]';
    case 'new_course':
      return 'bg-rose-500';
    case 'new_lesson':
      return 'bg-violet-500';
    case 'certificate':
      return 'bg-amber-500';
    default:
      return 'bg-[var(--color-muted)]';
  }
}
