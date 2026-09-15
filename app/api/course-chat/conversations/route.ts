/**
 * GET /api/course-chat/conversations?courseId=<uuid>
 *
 * Returns the caller's most recent chat_conversations for this course (up to
 * 20, archived and active mixed, newest first). Used by the history panel
 * in CourseChatDrawer. Each row is enriched with a `preview` field sourced
 * from the first user message when a generated title is not available.
 *
 * RLS scopes the query to auth.uid() automatically.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { courseChatUnavailableResponse } from '@/lib/services/ai/availability';
import { createClient as createSupabaseServer } from '@/core/supabase/server';
import { rateLimit } from '@/core/rate-limit';

export const runtime = 'nodejs';

const QuerySchema = z.object({
  courseId: z.string().uuid(),
});

// Listing fans out into per-row preview lookups (intentional N+1 over
// the pooler); cap at 60/min per user so a runaway useEffect doesn't
// hammer the chat history endpoint.
const CONV_LIST_LIMIT = { maxRequests: 60, windowMs: 60_000 };

export async function GET(request: Request) {
  const unavailable = courseChatUnavailableResponse();
  if (unavailable) return unavailable;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    courseId: url.searchParams.get('courseId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'missing or invalid courseId' }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  const rl = rateLimit(`conv-list:${user.id}`, CONV_LIST_LIMIT);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const { data: conversations, error } = await supabase
    .from('chat_conversations')
    .select('id, title, is_archived, created_at, last_message_at')
    .eq('course_id', parsed.data.courseId)
    .order('last_message_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: 'failed to update or load conversations' }, { status: 500 });
  }

  // Fallback preview from the first user message when the title is missing.
  const enriched = await Promise.all(
    (conversations ?? []).map(async (c) => {
      if (c.title) return { ...c, preview: null };
      const { data: firstMsg } = await supabase
        .from('chat_messages')
        .select('content')
        .eq('conversation_id', c.id)
        .eq('role', 'user')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const raw = firstMsg?.content ?? '';
      const trimmed = raw.length > 80 ? raw.slice(0, 80).trim() + '…' : raw.trim();
      return { ...c, preview: trimmed || null };
    }),
  );

  return NextResponse.json({ conversations: enriched });
}
