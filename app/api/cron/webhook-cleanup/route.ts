import { authorizeJob } from '@/lib/jobs/auth';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/core/supabase/admin';

/**
 * Periodic cleanup for webhook-related ephemeral tables.
 *
 *   - webhook_rate_limit_hits : the sliding-window limiter only reads
 *     the last 60s; anything older is dead weight. Keep 5 minutes for
 *     audit/debug, then purge.
 *   - webhook_logs (opt-in)   : eventually this will need trimming too,
 *     but we keep all logs today because the admin Logs tab is the only
 *     history we have. Revisit when the table crosses ~1M rows.
 *
 * Idempotent — deletes are bounded by a timestamp filter.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeJob(request);
  if (denied) return denied;

  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const rateLimitCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const [{ data: purged, error: purgeErr }, { data: cleared, error: clearErr }] =
      await Promise.all([
        supabase
          .from('webhook_rate_limit_hits')
          .delete()
          .lt('hit_at', rateLimitCutoff)
          .select('id'),
        // Clear expired rotation grace windows so stale `previous_secret_key`
        // values don't sit in the DB any longer than their intended TTL.
        supabase
          .from('webhook_configs')
          .update({
            previous_secret_key: null,
            previous_secret_expires_at: null,
          })
          .lt('previous_secret_expires_at', nowIso)
          .select('id'),
      ]);

    if (purgeErr) {
      console.error('[webhook-cleanup] rate-limit delete failed:', purgeErr);
      return NextResponse.json({ error: 'cleanup_failed' }, { status: 500 });
    }
    if (clearErr) {
      console.error('[webhook-cleanup] grace clear failed:', clearErr);
      return NextResponse.json({ error: 'cleanup_failed' }, { status: 500 });
    }

    return NextResponse.json({
      rateLimitHitsPurged: purged?.length ?? 0,
      graceWindowsCleared: cleared?.length ?? 0,
      ranAt: nowIso,
    });
  } catch { return NextResponse.json({ error: 'cleanup_failed' }, { status: 500 }); }
}
