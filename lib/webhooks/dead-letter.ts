import { createAdminClient } from '@/core/supabase/admin';

/**
 * Dead-letter retry cadence: 1m, 5m, 15m, 1h, 6h, 24h.
 *
 * Enqueue uses index 0. After each failed cron attempt, the next
 * index selects the subsequent gap. Six cron attempts are available;
 * after the sixth failure the row is abandoned for manual review.
 */
const RETRY_DELAYS_MS = [
  60_000,         // 1 minute
  5 * 60_000,     // 5 minutes
  15 * 60_000,    // 15 minutes
  60 * 60_000,    // 1 hour
  6 * 60 * 60_000,   // 6 hours
  24 * 60 * 60_000,  // 24 hours
];

export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

export interface EnqueueDeadLetterParams {
  webhookConfigId?: string | null;
  provider: string;
  eventType: string;
  payload: Record<string, unknown>;
  error: string;
}

/**
 * Push a failed event onto the retry queue. First attempt is scheduled
 * for one minute from now, and the cron worker picks up from there.
 */
export async function enqueueDeadLetter(
  params: EnqueueDeadLetterParams,
): Promise<void> {
  const supabase = createAdminClient();
  const nextAttemptAt = new Date(Date.now() + RETRY_DELAYS_MS[0]).toISOString();

  const { error } = await supabase.from('webhook_dead_letters').insert({
    webhook_config_id: params.webhookConfigId ?? null,
    provider: params.provider,
    event_type: params.eventType,
    payload: params.payload,
    last_error: params.error,
    attempt_count: 0,
    status: 'pending',
    next_attempt_at: nextAttemptAt,
  });

  if (error) {
    throw new Error('Retry queue could not be persisted');
  }
}

/**
 * Returns the `next_attempt_at` ISO timestamp for a row that just
 * attempted and is about to fail again. Returns null when the attempt
 * budget is exhausted — caller should mark the row 'abandoned'.
 */
export function computeNextAttemptAt(nextAttemptCount: number): string | null {
  const delayIdx = nextAttemptCount; // initial enqueue already used the first delay
  const delay = RETRY_DELAYS_MS[delayIdx];
  if (delay === undefined) return null;
  return new Date(Date.now() + delay).toISOString();
}
