import { claimWebhookEvent, finishWebhookEvent } from './idempotency';
import { enqueueDeadLetter } from './dead-letter';
import { logWebhook, processEnrollment } from './processor';
import { revokeEnrollment, scheduleEnrollmentExpiry, renewEnrollment } from './revoke';
import { webhookWorkSchema, type PaymentWebhookConfig, type WebhookWork } from './work';

export interface DeliveryResult { status: 200 | 202 | 503; body: Record<string, unknown> }
export async function executeWebhookDelivery(work: WebhookWork, config: PaymentWebhookConfig, options: { enqueueOnFailure?: boolean } = {}): Promise<DeliveryResult> {
  if (!webhookWorkSchema.safeParse(work).success || !config.is_active || config.provider !== work.provider) {
    return { status: 503, body: { error: 'Webhook configuration or work unavailable' } };
  }
  let token: string;
  try {
    const claim = await claimWebhookEvent(work.provider, work.eventId, work.eventType);
    if (claim.state === 'processed') return { status: 200, body: { received: true, replay: true } };
    if (claim.state === 'busy') return { status: 503, body: { error: 'Event is being processed; retry later' } };
    token = claim.token;
  } catch {
    return { status: 503, body: { error: 'Event storage unavailable; retry later' } };
  }
  try {
    const action = work.action;
    if (action.kind === 'enroll') {
      await processEnrollment({ ...action, provider: work.provider, webhookConfigId: config.id, accessLevelId: config.access_level_id, expirationDays: config.expiration_days });
    } else {
      const common = { provider: work.provider, transactionId: action.transactionId, webhookConfigId: config.id, eventType: work.eventType };
      const result = action.kind === 'revoke'
        ? await revokeEnrollment({ ...common, reason: action.reason })
        : action.kind === 'renew'
          ? await renewEnrollment({ ...common, expiresAt: action.expiresAt })
          : await scheduleEnrollmentExpiry({ ...common, expiresAt: action.expiresAt });
      if (!result.found) throw new Error('Enrollment not found; retry or review transaction mapping');
    }
    await finishWebhookEvent(work.provider, work.eventId, token, true);
    // Audit failure must not retry access or notifications after completion.
    await logWebhook({ webhookConfigId: config.id, provider: work.provider, eventType: work.eventType, payload: { eventId: work.eventId, transactionId: action.transactionId }, status: 'processed' }).catch(() => {});
    return { status: 200, body: { received: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment processing failed';
    let queued = false;
    if (options.enqueueOnFailure !== false) {
      try {
        await enqueueDeadLetter({ webhookConfigId: config.id, provider: work.provider, eventType: work.eventType, payload: work, error: message });
        queued = true;
      } catch { /* Non-2xx leaves retry responsibility with the sender. */ }
    }
    try { await finishWebhookEvent(work.provider, work.eventId, token, false); } catch { /* Lease permits recovery after a crash/DB outage. */ }
    return queued
      ? { status: 202, body: { received: true, queued: true } }
      : { status: 503, body: { error: 'Payment processing failed; retry later' } };
  }
}
