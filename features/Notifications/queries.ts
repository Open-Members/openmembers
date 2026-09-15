import { createClient } from '@/core/supabase/client';
import type { Notification } from '@/shared/types/interfaces';

// --- Notifications reads (client-side -- no server action POST) ---

export async function fetchNotifications(
  userId: string,
  limit = 30,
): Promise<Notification[]> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, message, message_key, message_params, action_url, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) throw new Error('loadFailed');

    return data.map((n) => ({
      id: n.id,
      userId: n.user_id,
      type: n.type as Notification['type'],
      title: n.title ?? null,
      message: n.message,
      messageKey: typeof n.message_key === 'string' ? n.message_key : null,
      messageParams:
        typeof n.message_params === 'object' &&
        n.message_params !== null &&
        !Array.isArray(n.message_params)
          ? (n.message_params as Record<string, unknown>)
          : null,
      actionUrl: n.action_url ?? null,
      isRead: n.is_read,
      createdAt: n.created_at,
    }));
  } catch {
    throw new Error('loadFailed');
  }
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  try {
    const supabase = createClient();

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error || count === null) throw new Error('countFailed');
    return count;
  } catch {
    throw new Error('countFailed');
  }
}
