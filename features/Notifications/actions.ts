'use server';

import { createClient } from '@/core/supabase/server';
import { markNotificationReadSchema, deleteNotificationSchema } from '@/core/validation/schemas';

export async function markNotificationRead(notificationId: string) {
  const parsed = markNotificationReadSchema.safeParse({ notificationId });
  if (!parsed.success) return { error: 'invalidInput' };
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'notAuthenticated' };
    const { data, error } = await supabase.from('notifications')
      .update({ is_read: true }).eq('id', parsed.data.notificationId).eq('user_id', user.id)
      .select('id').maybeSingle();
    if (error) return { error: 'readFailed' };
    if (!data) return { error: 'unavailable' };
    return { success: true };
  } catch { return { error: 'readFailed' }; }
}

export async function deleteNotification(notificationId: string) {
  const parsed = deleteNotificationSchema.safeParse({ notificationId });
  if (!parsed.success) return { error: 'invalidInput' };
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'notAuthenticated' };
    const { data, error } = await supabase.from('notifications')
      .delete().eq('id', parsed.data.notificationId).eq('user_id', user.id).select('id').maybeSingle();
    if (error) return { error: 'deleteFailed' };
    if (!data) return { error: 'unavailable' };
    return { success: true };
  } catch { return { error: 'deleteFailed' }; }
}

export async function markAllNotificationsRead() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'notAuthenticated' };
    const { error } = await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', user.id).eq('is_read', false);
    if (error) return { error: 'readAllFailed' };
    return { success: true };
  } catch { return { error: 'readAllFailed' }; }
}
