import { createAdminClient } from '@/core/supabase/admin';
import {
  renderNotificationDescriptor,
  type NotificationDescriptor,
} from '@/core/notifications/messages';
import type { NotificationType } from '@/shared/types/interfaces';

/**
 * Canonical service-role writer. Callers authorize the event before reaching
 * this layer; automatic content carries a descriptor and literal content does
 * not. Every descriptor also persists its English recovery snapshot.
 */
type LiteralContent = {
  title: string;
  message: string;
  descriptor?: never;
};

type AutomaticContent = {
  descriptor: NotificationDescriptor;
  title?: never;
  message?: never;
};

type NotificationContent = LiteralContent | AutomaticContent;

export type CreateNotificationInput = NotificationContent & {
  userId: string;
  type: NotificationType;
  actionUrl?: string | null;
};

export type CreateNotificationsInput = NotificationContent & {
  userIds: string[];
  type: NotificationType;
  actionUrl?: string | null;
  /** Same value for every recipient; uniqueness is scoped by user in SQL. */
  dedupeKey?: string;
};

type PersistedContent = {
  title: string;
  message: string;
  message_key: string | null;
  message_params: Record<string, string> | null;
};

function persistedContent(input: NotificationContent): PersistedContent | null {
  if ('descriptor' in input && input.descriptor) {
    const fallback = renderNotificationDescriptor(input.descriptor, 'en');
    if (!fallback) return null;
    return {
      ...fallback,
      message_key: input.descriptor.key,
      message_params: input.descriptor.params,
    };
  }
  if (typeof input.title !== 'string' || typeof input.message !== 'string') return null;
  return {
    title: input.title,
    message: input.message,
    message_key: null,
    message_params: null,
  };
}

/** Creates one row and confirms that the database returned its identity. */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<{ id: string } | { error: 'notificationInsertFailed' }> {
  const content = persistedContent(input);
  if (!content) return { error: 'notificationInsertFailed' };
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('notifications').insert({
    user_id: input.userId,
    type: input.type,
    ...content,
    action_url: input.actionUrl ?? null,
  }).select('id').single();

  if (error || !data) return { error: 'notificationInsertFailed' };
  return { id: data.id };
}

/**
 * Inserts unique recipients in chunks. When `dedupeKey` is present, retrying
 * after any partially completed chunk is safe: existing user/key pairs are
 * ignored and only missing rows are inserted.
 */
export async function createNotifications(
  input: CreateNotificationsInput,
): Promise<
  | { inserted: number; targeted: number }
  | { error: 'notificationInsertFailed'; inserted: number }
> {
  const userIds = Array.from(new Set(input.userIds));
  if (userIds.length === 0) return { inserted: 0, targeted: 0 };
  const content = persistedContent(input);
  if (!content) return { error: 'notificationInsertFailed', inserted: 0 };
  if (
    input.dedupeKey !== undefined &&
    (input.dedupeKey.length === 0 || input.dedupeKey.length > 500)
  ) {
    return { error: 'notificationInsertFailed', inserted: 0 };
  }

  const supabase = createAdminClient();
  const chunkSize = 500;
  let inserted = 0;
  for (let start = 0; start < userIds.length; start += chunkSize) {
    const rows = userIds.slice(start, start + chunkSize).map((userId) => ({
      user_id: userId,
      type: input.type,
      ...content,
      action_url: input.actionUrl ?? null,
      dedupe_key: input.dedupeKey ?? null,
    }));
    const statement = input.dedupeKey
      ? supabase.from('notifications').upsert(rows, {
          onConflict: 'user_id,dedupe_key',
          ignoreDuplicates: true,
        })
      : supabase.from('notifications').insert(rows);
    const { data, error } = await statement.select('id');
    if (error || !data) return { error: 'notificationInsertFailed', inserted };
    inserted += data.length;
  }

  return { inserted, targeted: userIds.length };
}
