import { redirect } from 'next/navigation';
import { createClient } from '@/core/supabase/server';
import { NotificationsPageClient } from '@/features/Notifications/components/NotificationsPageClient';
import type { Notification } from '@/shared/types/interfaces';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  let notifications: Notification[] = [];
  let initialLoadFailed = false;
  try {
    const { data, error } = await supabase.from('notifications')
      .select('id, user_id, type, title, message, message_key, message_params, action_url, is_read, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
    if (error || !data) initialLoadFailed = true;
    else notifications = data.map(n => ({ id: n.id, userId: n.user_id, type: n.type as Notification['type'],
      title: n.title ?? null, message: n.message,
      messageKey: typeof n.message_key === 'string' ? n.message_key : null,
      messageParams: typeof n.message_params === 'object' && n.message_params !== null && !Array.isArray(n.message_params)
        ? n.message_params as Record<string, unknown> : null,
      actionUrl: n.action_url ?? null, isRead: n.is_read, createdAt: n.created_at }));
  } catch { initialLoadFailed = true; }

  return <div className="px-4 md:px-8 lg:px-12 py-8 md:py-12">
    <NotificationsPageClient key={initialLoadFailed ? 'failed' : 'loaded'} initialNotifications={notifications} initialLoadFailed={initialLoadFailed} initialNow={new Date().toISOString()} />
  </div>;
}
