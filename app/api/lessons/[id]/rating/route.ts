/**
 * GET    /api/lessons/[id]/rating
 *   Returns the caller's own rating (if any) + the aggregate stats
 *   (avg, count, distribution by star) for the lesson.
 *
 * PUT    /api/lessons/[id]/rating
 *   Upsert the caller's rating. Body: { stars: 1..5, comment?: string }.
 *
 * DELETE /api/lessons/[id]/rating
 *   Remove the caller's rating.
 *
 * Auth required on all three. The RLS policies scope writes to the
 * caller's own row automatically; reads are open so aggregates work.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createSupabaseServer } from '@/core/supabase/server';
import { rateLimit } from '@/core/rate-limit';
import { detectSecret } from '@/core/security/secret-scanner';

export const runtime = 'nodejs';

// 60 writes/min per user — well above any sane human cadence; blocks
// scripted abuse that would otherwise inflate `lesson_ratings` rows.
const RATING_WRITE_LIMIT = { maxRequests: 60, windowMs: 60_000 };

function rateLimited(userId: string, op: 'put' | 'delete'): NextResponse | null {
  const rl = rateLimit(`rating:${op}:${userId}`, RATING_WRITE_LIMIT);
  if (rl.success) return null;
  return NextResponse.json(
    { error: 'rate limit exceeded — try again in a minute' },
    { status: 429, headers: { 'Retry-After': '60' } },
  );
}

const IdSchema = z.string().uuid();
const BodySchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().nullable(),
});

interface Aggregate {
  avg: number | null;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

async function loadAggregate(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  lessonId: string,
): Promise<Aggregate> {
  const { data: rows } = await supabase
    .from('lesson_ratings')
    .select('stars')
    .eq('lesson_id', lessonId);

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const r of rows ?? []) {
    const s = r.stars as 1 | 2 | 3 | 4 | 5;
    if (s >= 1 && s <= 5) {
      distribution[s] += 1;
      total += 1;
      sum += s;
    }
  }
  return {
    avg: total > 0 ? Number((sum / total).toFixed(2)) : null,
    count: total,
    distribution,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid lesson id' }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  const [{ data: mine }, aggregate] = await Promise.all([
    supabase
      .from('lesson_ratings')
      .select('stars, comment, updated_at')
      .eq('lesson_id', parsed.data)
      .eq('user_id', user.id)
      .maybeSingle(),
    loadAggregate(supabase, parsed.data),
  ]);

  return NextResponse.json({
    myRating: mine
      ? { stars: mine.stars, comment: mine.comment ?? null, updated_at: mine.updated_at }
      : null,
    aggregate,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idParsed = IdSchema.safeParse(id);
  if (!idParsed.success) {
    return NextResponse.json({ error: 'invalid lesson id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'expected { stars: 1..5, comment?: string }', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.comment) {
    const hit = detectSecret(parsed.data.comment);
    if (hit) {
      return NextResponse.json(
        { error: 'comment looks like it contains a secret/API key — please remove it before saving' },
        { status: 400 },
      );
    }
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  const limited = rateLimited(user.id, 'put');
  if (limited) return limited;

  // Defense-in-depth: verify the lesson exists (RLS on lessons lets the
  // authenticated user see free-preview + accessible ones; for gated
  // lessons, maybeSingle returns null and we surface 404). Access gating
  // beyond this is handled by the course page itself.
  const { data: lesson } = await supabase
    .from('lessons')
    .select('id')
    .eq('id', idParsed.data)
    .maybeSingle();
  if (!lesson) {
    return NextResponse.json({ error: 'lesson not found or no access' }, { status: 404 });
  }

  const normalizedComment = parsed.data.comment?.trim() || null;

  const { error } = await supabase
    .from('lesson_ratings')
    .upsert(
      {
        lesson_id: idParsed.data,
        user_id: user.id,
        stars: parsed.data.stars,
        comment: normalizedComment,
      },
      { onConflict: 'lesson_id,user_id' },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const aggregate = await loadAggregate(supabase, idParsed.data);
  return NextResponse.json({
    ok: true,
    myRating: { stars: parsed.data.stars, comment: normalizedComment },
    aggregate,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid lesson id' }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  const limited = rateLimited(user.id, 'delete');
  if (limited) return limited;

  const { error } = await supabase
    .from('lesson_ratings')
    .delete()
    .eq('lesson_id', parsed.data)
    .eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const aggregate = await loadAggregate(supabase, parsed.data);
  return NextResponse.json({ ok: true, myRating: null, aggregate });
}
