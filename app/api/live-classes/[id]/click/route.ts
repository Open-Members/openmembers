/**
 * POST /api/live-classes/[id]/click
 *
 * Fire-and-forget attendance tracker. Logs at most one row per
 * (class, user, source, UTC hour) in live_class_clicks — DB-level
 * dedupe via the `live_class_clicks_dedupe_hour` unique constraint
 * + ON CONFLICT DO NOTHING here. Admin analytics still read distinct
 * users for turnout and per-hour buckets for intensity. Returns 204 no
 * matter what so the button never blocks the real join flow.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createSupabaseServer } from '@/core/supabase/server';
import { rateLimit } from '@/core/rate-limit';

export const runtime = 'nodejs';

const IdSchema = z.string().uuid();
const SourceSchema = z.enum(['banner', 'calendar', 'admin']).default('banner');

// 30 clicks/min per user — enough for an enthusiastic student bouncing
// between calendar + banner during a live event, but caps row-bloat
// from a script in a tight loop.
const CLICK_LIMIT = { maxRequests: 30, windowMs: 60_000 };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) return new Response(null, { status: 204 });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 204 });

  // Endpoint is fire-and-forget by design (always returns 204), so a
  // rate-limit miss is also silently swallowed — we just skip the insert.
  const rl = rateLimit(`live-click:${user.id}`, CLICK_LIMIT);
  if (!rl.success) return new Response(null, { status: 204 });

  let source: 'banner' | 'calendar' | 'admin' = 'banner';
  try {
    const body = (await request.json()) as { source?: string };
    const s = SourceSchema.safeParse(body.source);
    if (s.success) source = s.data;
  } catch {
    // No body → default source.
  }

  const userAgent = request.headers.get('user-agent') ?? null;

  // Upsert + ignoreDuplicates leans on the DB unique constraint to keep
  // at most one row per (class, user, source, hour) — see migration
  // 20260426_live_class_clicks_dedupe_hour.sql.
  await supabase.from('live_class_clicks').upsert(
    {
      live_class_id: parsed.data,
      user_id: user.id,
      source,
      user_agent: userAgent,
    },
    {
      onConflict: 'live_class_id,user_id,source,clicked_hour',
      ignoreDuplicates: true,
    },
  );

  return new Response(null, { status: 204 });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST /api/live-classes/<id>/click with an auth cookie.' },
    { status: 405 },
  );
}
