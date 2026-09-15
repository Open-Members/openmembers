import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/core/supabase/admin';
export async function claimWebhookEvent(provider: string, eventId: string, eventType: string) {
  const token = randomUUID();
  const { data, error } = await createAdminClient().rpc('claim_webhook_event', {
    p_provider: provider, p_event_id: eventId, p_event_type: eventType, p_token: token,
  });
  if (error || !['claimed', 'processed', 'busy'].includes(data)) throw new Error('Event storage unavailable');
  return { state: data as 'claimed' | 'processed' | 'busy', token };
}
export async function finishWebhookEvent(provider: string, eventId: string, token: string, success: boolean) {
  const { data, error } = await createAdminClient().rpc('finish_webhook_event', {
    p_provider: provider, p_event_id: eventId, p_token: token, p_success: success,
  });
  if (error || data !== true) throw new Error('Event claim could not be finalized');
}
