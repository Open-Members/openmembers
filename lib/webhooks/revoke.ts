import { createAdminClient } from '@/core/supabase/admin';
import type { WebhookWork } from './work';
export type RevocationReason = 'refund' | 'chargeback' | 'dispute' | 'cancelled' | 'fraud';
interface CommonParams {
  provider: WebhookWork['provider'];
  transactionId: string;
  webhookConfigId?: string;
  eventType?: string;
}
interface RevokeParams extends CommonParams { reason: RevocationReason }
interface ScheduleExpiryParams extends CommonParams { expiresAt: string }
interface RevokeResult { found: boolean; enrollmentId?: string }

/** Database row locking serializes renewal/refund/expiry on the current transaction.
 * Missing enrollment is returned to the delivery queue, which can retry out-of-order events.
 * Expiry only extends the last promised date; renewals cannot resurrect definitive revocations.
 */
async function mutate(params: CommonParams, kind: 'revoke' | 'expire' | 'renew', expiresAt: string | null, reason: string | null): Promise<RevokeResult> {
  const { data, error } = await createAdminClient().rpc('mutate_payment_enrollment', {
    p_provider: params.provider, p_transaction_id: params.transactionId, p_kind: kind, p_expires_at: expiresAt, p_reason: reason,
  });
  if (error || typeof data?.found !== 'boolean') throw new Error('Enrollment mutation failed');
  return data;
}
export async function revokeEnrollment(params: RevokeParams) {
  return mutate(params, 'revoke', null, params.reason);
}
export async function scheduleEnrollmentExpiry(params: ScheduleExpiryParams) {
  return mutate(params, 'expire', params.expiresAt, null);
}
export async function renewEnrollment(params: ScheduleExpiryParams) {
  return mutate(params, 'renew', params.expiresAt, null);
}
