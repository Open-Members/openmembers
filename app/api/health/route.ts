import { NextResponse } from 'next/server';
import { createAdminClient } from '@/core/supabase/admin';

// Lightweight probe for external uptime monitors (BetterStack, Pingdom,
// etc). No auth — that's the point. Runs a cheap 'select 1' against the
// DB so a green 200 means both the app process AND Supabase are
// reachable. Returns 503 if the DB is unreachable so the monitor pages
// us instead of reporting a happy 200 during a partial outage.

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();

  let db: 'ok' | 'fail' = 'fail';

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('tenant_settings')
      .select('id')
      .limit(1);
    if (!error) db = 'ok';
  } catch {
    db = 'fail';
  }

  const status = db === 'ok' ? 'ok' : 'degraded';
  const body = {
    status,
    db,
    latencyMs: Date.now() - started,
    ts: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: db === 'ok' ? 200 : 503,
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}
