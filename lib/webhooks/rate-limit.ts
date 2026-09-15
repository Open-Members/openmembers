import { createAdminClient } from '@/core/supabase/admin';

/**
 * Sliding-window rate limit for webhook endpoints.
 *
 * Counts rows in webhook_rate_limit_hits for a given config in the last
 * 60 seconds. If the count is at or above the threshold, the request is
 * rejected with 429. Otherwise a new row is inserted and the caller
 * proceeds.
 *
 * The threshold is deliberately loose (30/min default) — it's there to
 * blunt brute-force token probing and runaway gateway retry loops, not
 * to police legitimate bursty purchases. Tenants with higher volume
 * should get a per-config override instead of bumping this globally.
 */

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_HITS = 30;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the client should retry. Populated only when denied. */
  retryAfter?: number;
  /** Current count over the window — useful for logging/debugging. */
  currentCount: number;
}

export async function checkWebhookRateLimit(
  webhookConfigId: string,
  {
    windowSeconds = DEFAULT_WINDOW_SECONDS,
    maxHits = DEFAULT_MAX_HITS,
  }: { windowSeconds?: number; maxHits?: number } = {},
): Promise<RateLimitResult> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count, error } = await supabase
    .from('webhook_rate_limit_hits')
    .select('id', { count: 'exact', head: true })
    .eq('webhook_config_id', webhookConfigId)
    .gte('hit_at', since);

  if (error) {
    // Fail-open on counter read errors — better to process a real sale
    // than to 429 legit traffic because the limiter table is down. The
    // processor has its own idempotency guards downstream.
    console.error('[webhook rate-limit] count query failed:', error);
    return { allowed: true, currentCount: -1 };
  }

  const currentCount = count ?? 0;
  if (currentCount >= maxHits) {
    return {
      allowed: false,
      retryAfter: windowSeconds,
      currentCount,
    };
  }

  // Record this hit so subsequent requests in the same window see it.
  // Fire-and-forget: if the insert fails, the request still proceeds.
  const { error: insertError } = await supabase
    .from('webhook_rate_limit_hits')
    .insert({ webhook_config_id: webhookConfigId });
  if (insertError) {
    console.error('[webhook rate-limit] insert failed:', insertError);
  }

  return { allowed: true, currentCount: currentCount + 1 };
}
