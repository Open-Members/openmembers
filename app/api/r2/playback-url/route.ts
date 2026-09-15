import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import { isUserLessonAccessible } from '@/core/access/server';
import { presignPlayback } from '@/lib/services/r2/presign';
import { isR2Configured } from '@/lib/services/r2/client';
import { hasSupabaseAdminConfiguration, hasSupabaseConfiguration } from '@/core/config/env';
import { z } from 'zod';

/**
 * Mint a short-lived GET URL for a lesson video stored in R2. Requires
 * the caller to be authenticated AND to have access to the course the
 * lesson belongs to — otherwise leaked lesson IDs would expose content.
 *
 * Query: ?lessonId=<uuid>
 * Returns: { url } — the browser uses it as the <video src>.
 */
export async function GET(request: NextRequest) {
  if (!isR2Configured() || !hasSupabaseConfiguration() || !hasSupabaseAdminConfiguration()) {
    return NextResponse.json({ error: 'R2 is not configured' }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lessonId = request.nextUrl.searchParams.get('lessonId');
  if (!z.uuid().safeParse(lessonId).success) {
    return NextResponse.json({ error: 'A valid lessonId is required' }, { status: 400 });
  }
  // Authorize before the privileged lookup, including profile status and drip.
  if (!(await isUserLessonAccessible(user.id, lessonId!))) {
    return NextResponse.json({ error: 'No access to this lesson' }, { status: 403 });
  }

  // Resolve the lesson + its owning course so we can run the access check.
  // Admin client bypasses RLS so we don't need RLS policies to cover this path.
  const admin = createAdminClient();
  const { data: lesson, error } = await admin
    .from('lessons')
    .select('id, video_provider, video_external_id')
    .eq('id', lessonId!)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Video storage is unavailable. Try again later.' }, { status: 502 });
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  if (lesson.video_provider !== 'r2' || !lesson.video_external_id) {
    return NextResponse.json({ error: 'Lesson is not an R2-hosted video' }, { status: 400 });
  }

  try {
    const url = await presignPlayback(lesson.video_external_id);
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Video storage is unavailable. Try again later.' }, { status: 502 });
  }
}
