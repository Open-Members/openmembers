import { NextResponse } from 'next/server';
import { createAdminClient } from '@/core/supabase/admin';
import { authorizeJob } from '@/lib/jobs/auth';
import { executeWebhookDelivery } from '@/lib/webhooks/delivery';
import { webhookWorkSchema, type PaymentWebhookConfig } from '@/lib/webhooks/work';
import { computeNextAttemptAt, MAX_ATTEMPTS } from '@/lib/webhooks/dead-letter';

/** Retry only validated, authenticated work; legacy raw payloads require manual review. */
export async function GET(request: Request) {
  const denied = authorizeJob(request);
  if (denied) return denied;
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data: due, error } = await supabase.from('webhook_dead_letters').select('*').eq('status', 'pending')
      .lte('next_attempt_at', now).order('next_attempt_at').limit(20);
    if (error) throw new Error('Retry query failed');
    let processed = 0;
    let abandoned = 0;
    let rescheduled = 0;
    for (const row of due ?? []) {
      // Move the deadline atomically. Another worker cannot take this row for five minutes.
      const leaseUntil = new Date(Date.now() + 5 * 60_000).toISOString();
      const claimed = await supabase.from('webhook_dead_letters').update({ next_attempt_at: leaseUntil, updated_at: now })
        .eq('id', row.id).eq('status', 'pending').eq('next_attempt_at', row.next_attempt_at).select('id').maybeSingle();
      if (claimed.error) throw new Error('Retry claim failed');
      if (!claimed.data) continue;
      const write = async (values: Record<string, unknown>) => {
        const result = await supabase.from('webhook_dead_letters').update({ ...values, updated_at: now })
          .eq('id', row.id).eq('status', 'pending').eq('next_attempt_at', leaseUntil).select('id').maybeSingle();
        if (result.error || !result.data) throw new Error('Retry state write failed');
      };
      const parsed = webhookWorkSchema.safeParse(row.payload);
      if (!parsed.success || parsed.data.provider !== row.provider || !row.webhook_config_id) {
        await write({ status: 'abandoned', last_error: 'Invalid or legacy work; manual review required' });
        abandoned++;
        continue;
      }
      let delivered = false;
      let failure = 'Delivery failed';
      try {
        const config = await supabase.from('webhook_configs').select('*').eq('id', row.webhook_config_id).maybeSingle();
        if (config.error) throw new Error('Configuration lookup failed');
        if (!config.data || !config.data.is_active || config.data.provider !== row.provider) {
          await write({ status: 'abandoned', last_error: 'Configuration missing, disabled, or provider mismatch; manual review required' });
          abandoned++;
          continue;
        }
        const outcome = await executeWebhookDelivery(parsed.data, config.data as PaymentWebhookConfig, { enqueueOnFailure: false });
        delivered = outcome.status === 200;
      } catch { failure = 'Delivery or configuration unavailable'; }
      const attempts = row.attempt_count + 1;
      if (delivered) {
        await write({ status: 'processed', attempt_count: attempts, last_error: null });
        processed++;
      } else if (attempts >= MAX_ATTEMPTS) {
        await write({ status: 'abandoned', attempt_count: attempts, last_error: failure });
        abandoned++;
      } else {
        await write({ attempt_count: attempts, last_error: failure, next_attempt_at: computeNextAttemptAt(attempts) });
        rescheduled++;
      }
    }
    return NextResponse.json({ processed, abandoned, rescheduled, batchSize: due?.length ?? 0 });
  } catch { return NextResponse.json({ error: 'webhook_retry_failed' }, { status: 500 }); }
}
