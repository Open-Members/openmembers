/**
 *   GET    /api/course-chat/conversations/[id]
 *     Full conversation detail — used when the user clicks an item in the
 *     history panel. Returns the conversation row + its messages in order.
 *
 *   DELETE /api/course-chat/conversations/[id]
 *     Permanent delete (not archive — archive is the "New chat" path). RLS
 *     gates ownership so attempting to delete someone else's row returns
 *     404 via the RLS-suppressed empty update result.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { courseChatUnavailableResponse } from '@/lib/services/ai/availability';
import { createClient as createSupabaseServer } from '@/core/supabase/server';

export const runtime = 'nodejs';

const IdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unavailable = courseChatUnavailableResponse();
  if (unavailable) return unavailable;

  const { id } = await params;
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid conversation id' }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  const { data: conv } = await supabase
    .from('chat_conversations')
    .select('id, title, is_archived, created_at, last_message_at, course_id')
    .eq('id', parsed.data)
    .maybeSingle();

  if (!conv) {
    return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  }

  const { data: messages, error: msgErr } = await supabase
    .from('chat_messages')
    .select('id, role, content, citations, created_at')
    .eq('conversation_id', parsed.data)
    .order('created_at', { ascending: true });

  if (msgErr) {
    return NextResponse.json({ error: 'failed to load conversation messages' }, { status: 500 });
  }

  return NextResponse.json({ conversation: conv, messages: messages ?? [] });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unavailable = courseChatUnavailableResponse();
  if (unavailable) return unavailable;

  const { id } = await params;
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid conversation id' }, { status: 400 });
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  const { error, count } = await supabase
    .from('chat_conversations')
    .delete({ count: 'exact' })
    .eq('id', parsed.data);

  if (error) {
    return NextResponse.json({ error: 'failed to update or load conversations' }, { status: 500 });
  }
  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
