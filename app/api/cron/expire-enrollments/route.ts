import { authorizeJob } from '@/lib/jobs/auth';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/core/supabase/admin';

/**
 * Daily cron — flips `is_active=false` on enrollments whose `expires_at`
 * is now in the past.
 *
 * Access is already blocked at read time (`getUserCourseAccess` filters
 * `expires_at > now()`), so this job exists for data consistency: admin
 * queries, F.4 segment selectors, and reports all read `is_active`, and
 * keeping that flag accurate is cheaper than re-deriving expiration
 * everywhere.
 *
 * Idempotent — the WHERE clause guarantees only still-active expired
 * rows are touched. Safe to re-run at any time.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeJob(request);
  if (denied) return denied;

  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: expired, error } = await supabase
      .from('enrollments')
      .update({ is_active: false })
      .lt('expires_at', nowIso)
      .eq('is_active', true)
      .select('id, user_id, access_level_id');

    if (error) {
      console.error('[expire-enrollments] update error:', error);
      return NextResponse.json({ error: 'database_operation_failed' }, { status: 500 });
    }

    const count = expired?.length ?? 0;
    if (count > 0) {
      console.log(`[expire-enrollments] Expired ${count} enrollment(s) at ${nowIso}`);
    }

    return NextResponse.json({ expired: count, ranAt: nowIso });
  } catch (err) {
    console.error('[expire-enrollments] fatal:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
