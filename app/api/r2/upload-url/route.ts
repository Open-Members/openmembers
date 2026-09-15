import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/core/supabase/server';
import {
  presignUpload,
  buildLessonVideoKey,
  buildCourseTrailerKey,
} from '@/lib/services/r2/presign';
import { isR2Configured } from '@/lib/services/r2/client';
import { rateLimit } from '@/core/rate-limit';
import { hasSupabaseConfiguration } from '@/core/config/env';
import { parseVideoUpload } from '@/lib/services/r2/upload';

// Generous cap for bulk upload sessions (an admin uploading a 30-lesson
// course in one sitting). Blocks scripted abuse without getting in the
// way of normal authoring flow.
const PRESIGN_LIMIT = { maxRequests: 100, windowMs: 60 * 60_000 };

/**
 * Mint a presigned PUT URL so admins can upload a lesson video directly
 * from the browser to R2 without routing bytes through Vercel (which has
 * a 4.5 MB request-body limit).
 *
 * Body: { lessonId, filename, contentType, size }
 * Returns: { uploadUrl, key } — the client fetches `uploadUrl` with PUT
 * and on 200, POSTs the key back to the lesson-save action.
 */
export async function POST(request: NextRequest) {
  if (!isR2Configured() || !hasSupabaseConfiguration()) {
    return NextResponse.json({ error: 'R2 is not configured on this deployment' }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.status !== 'active' || (profile?.role !== 'admin' && profile?.role !== 'super_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rl = rateLimit(`r2-presign:${user.id}`, PRESIGN_LIMIT);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'rate limit exceeded — try again in an hour' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const input = parseVideoUpload(body);
  if (!input) return NextResponse.json({ error: 'Invalid video upload: provide a scope, UUID, filename, supported video type and positive size up to 2 GiB.' }, { status: 400 });
  const { scope, scopeId, filename, contentType } = input;

  // Admin auth is already enforced above. We skip the "target must exist"
  // check so admins can upload for a record they're still drafting (dialog
  // in create mode). Abandoned uploads require a separate orphan review.
  const key =
    scope === 'course-trailer'
      ? buildCourseTrailerKey(scopeId, filename)
      : buildLessonVideoKey(scopeId, filename);
  try {
    const uploadUrl = await presignUpload({ key, contentType });
    return NextResponse.json({ uploadUrl, key }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Video storage is unavailable. Try again later.' }, { status: 502 });
  }
}
