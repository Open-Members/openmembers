/**
 * /api/course-chat — streaming chat + conversation persistence
 *
 *   POST    send a message; streams NDJSON ({citations, delta*, done}).
 *           Creates a new chat_conversation on first message of a thread
 *           (when `conversationId` is absent), then appends every message
 *           to chat_messages. Returns the conversation id in the `done`
 *           event so the client can thread follow-ups.
 *
 *   GET     ?courseId=X&action=resume — returns the user's most recent
 *           non-archived conversation for the course plus its messages.
 *
 *   PATCH   { conversationId, action: "archive" } — soft-closes a
 *           conversation so "New chat" starts fresh without losing history.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  retrieveContext,
  buildMessages,
  checkAndBumpRateLimit,
} from '@/lib/services/ai/course-chat';
import { chatCompletion, chatCompletionStream, type ChatMessage } from '@/lib/services/ai/gateway';
import { createClient as createSupabaseServer } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import { isUserCourseAccessible } from '@/core/access/server';
import { detectSecret } from '@/core/security/secret-scanner';
import { courseChatUnavailableResponse } from '@/lib/services/ai/availability';

export const runtime = 'nodejs';

const HistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
});

const BodySchema = z.object({
  courseId: z.string().uuid(),
  message: z.string().min(1).max(2000),
  /** Recent turns of the same conversation (client mirror of what's in DB).
   *  Caller should send at most the last ~8 messages; the server caps it. */
  history: z.array(HistoryMessageSchema).max(16).optional(),
  /** When omitted → start a new chat_conversations row. When provided →
   *  append to that conversation (must belong to the same user + course). */
  conversationId: z.string().uuid().nullable().optional(),
});

const PatchBodySchema = z.object({
  conversationId: z.string().uuid(),
  action: z.literal('archive'),
});

const RATE_LIMIT_PER_HOUR = 30;
const MAX_HISTORY_TO_FORWARD = 8;

async function getCourseTitle(courseId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('courses')
    .select('title')
    .eq('id', courseId)
    .maybeSingle();
  return data?.title ?? null;
}

/**
 * Generate a 4-6 word Title Case title for a conversation from its first
 * user message through the configured AI Gateway. Returns null on failure
 * so the history panel can show a preview of the first message.
 * Runs at most once per conversation (gated by the title check upstream).
 */
async function generateConversationTitle(
  firstUserMessage: string,
  courseTitle: string,
): Promise<string | null> {
  try {
    const response = await chatCompletion({
      model: 'anthropic/claude-haiku-4-5',
      messages: [
        {
          role: 'system',
          content: `Generate a concise 4-6 word title for a chat about the course "${courseTitle}". Use the language of the student's message. Output only the title, with no quotes or markdown. Name the specific topic of the student's question.`,
        },
        {
          role: 'user',
          content: `Generate a title for a conversation that starts with:\n\n"${firstUserMessage}"`,
        },
      ],
      maxTokens: 30,
      temperature: 0.3,
    });
    const raw = response.choices?.[0]?.message?.content ?? '';
    // Strip quotes, markdown asterisks, trailing punctuation, and cap length.
    const cleaned = raw
      .trim()
      .replace(/^["'`*]+|["'`*.!?]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .trim();
    return cleaned || null;
  } catch {
    console.error('[auto-title] generation failed');
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* POST — stream a new assistant turn into the current conversation   */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const unavailable = courseChatUnavailableResponse();
  if (unavailable) return unavailable;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed' },
      { status: 400 },
    );
  }
  const { courseId, message, history = [], conversationId: requestedConvId } = parsed.data;
  const conversationHistory: ChatMessage[] = history;

  // Reject pasted credentials before they touch the DB / LLM context.
  const secretHit = detectSecret(message) || history.some(turn => detectSecret(turn.content));
  if (secretHit) {
    return NextResponse.json(
      { error: 'secret_detected' },
      { status: 400 },
    );
  }

  // 1. Auth
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  // 2. Enrollment / course access
  if (!(await isUserCourseAccessible(user.id, courseId))) {
    return NextResponse.json({ error: 'no access to this course' }, { status: 403 });
  }

  try {
    // 3. Rate limit
    const rate = await checkAndBumpRateLimit(user.id, RATE_LIMIT_PER_HOUR);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }

    // 4. Resolve conversation — reuse or create. RLS enforces user scoping.
    let conversationId = requestedConvId ?? null;
    if (conversationId) {
      const { data: existing } = await supabase
        .from('chat_conversations')
        .select('id, course_id, is_archived')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!existing || existing.course_id !== courseId) {
        return NextResponse.json(
          { error: 'conversation not found for this course' },
          { status: 404 },
        );
      }
      // If the caller passed an archived conversation id, start fresh rather
      // than silently re-activating an archived thread.
      if (existing.is_archived) conversationId = null;
    }
    const courseTitle = await getCourseTitle(courseId);
    if (!courseTitle) {
      return NextResponse.json({ error: 'course not found' }, { status: 404 });
    }

    // Use the most recent user turn (if any) to anchor follow-up retrieval.
    const lastUserMessage = [...conversationHistory]
      .reverse()
      .find((m) => m.role === 'user')?.content;

    const chunks = await retrieveContext(courseId, message, supabase, {
      topK: 5,
      priorUserMessage: lastUserMessage,
    });
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'context_unavailable', message: 'Course chat has no prepared material for your accessible lessons yet.' },
        { status: 409 },
      );
    }

    if (!conversationId) {
      const { data: created, error: insertErr } = await supabase
        .from('chat_conversations')
        .insert({ user_id: user.id, course_id: courseId })
        .select('id')
        .single();
      if (insertErr || !created) {
        return NextResponse.json(
          { error: 'failed to create conversation' },
          { status: 500 },
        );
      }
      conversationId = created.id;
    }

    // 5. Persist the user's message before generation starts — if anything
    // explodes downstream we still keep what they asked so the UI can replay.
    const { error: messageError } = await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: message,
    });
    if (messageError) {
      return NextResponse.json({ error: 'failed to save message' }, { status: 500 });
    }

    const messages = buildMessages(courseTitle, message, chunks, conversationHistory, {
      maxHistory: MAX_HISTORY_TO_FORWARD,
    });

    const upstream = await chatCompletionStream({
      model: 'anthropic/claude-sonnet-4-6',
      messages,
      maxTokens: 1000,
      temperature: 0.3,
    });

    if (!upstream.body) {
      return NextResponse.json(
        { error: 'no stream body from AI Gateway' },
        { status: 502 },
      );
    }

    const citationsPayload = chunks.map((c) => ({
      lesson_id: c.lesson_id,
      lesson_title: c.lesson_title,
      lesson_slug: c.lesson_slug,
      course_slug: c.course_slug,
      start_seconds: c.start_seconds,
      end_seconds: c.end_seconds,
      similarity: c.similarity,
    }));

    const encoder = new TextEncoder();
    const emit = (ctrl: ReadableStreamDefaultController, obj: unknown) =>
      ctrl.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

    const finalConversationId = conversationId;

    const ndjsonStream = new ReadableStream({
      async start(controller) {
        // Send citations up-front so the client can bind pills as soon as
        // the first token referencing a lesson title arrives.
        emit(controller, { type: 'citations', citations: citationsPayload });

        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantBuffer = '';
        let usage: { input: number | null; output: number | null } = {
          input: null,
          output: null,
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length > 0) {
                  assistantBuffer += delta;
                  emit(controller, { type: 'delta', content: delta });
                }
                if (parsed.usage) {
                  usage = {
                    input: parsed.usage.prompt_tokens ?? null,
                    output: parsed.usage.completion_tokens ?? null,
                  };
                }
              } catch {
                /* ignore malformed SSE lines */
              }
            }
          }
        } catch {
          emit(controller, { type: 'error', error: 'stream_interrupted' });
        } finally {
          // Persist whatever the assistant produced (even partials — better
          // than losing the work on a late-stream failure).
          if (assistantBuffer.length > 0) {
            try {
              // RLS permits members to write only their own user messages.
              // This generated response uses the service only after the
              // request's authentication, course gate, and ownership checks.
              const admin = createAdminClient();
              const { data: ownedConversation, error: ownershipError } = await admin
                .from('chat_conversations')
                .select('id')
                .eq('id', finalConversationId)
                .eq('user_id', user.id)
                .eq('course_id', courseId)
                .maybeSingle();
              if (ownershipError || !ownedConversation) {
                throw new Error('Conversation is no longer available for this user');
              }
              const { error: assistantError } = await admin.from('chat_messages').insert({
                conversation_id: finalConversationId,
                role: 'assistant',
                content: assistantBuffer,
                citations: citationsPayload,
                tokens: usage,
              });
              if (assistantError) throw new Error('Failed to save generated response');
              await supabase
                .from('chat_conversations')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', finalConversationId);

              // Generate a title once, after the answer has been streamed.
              const { data: convRow } = await supabase
                .from('chat_conversations')
                .select('title')
                .eq('id', finalConversationId)
                .maybeSingle();
              if (convRow && !convRow.title) {
                const { data: firstUser } = await supabase
                  .from('chat_messages')
                  .select('content')
                  .eq('conversation_id', finalConversationId)
                  .eq('role', 'user')
                  .order('created_at', { ascending: true })
                  .limit(1)
                  .maybeSingle();
                if (firstUser?.content) {
                  const title = await generateConversationTitle(
                    firstUser.content,
                    courseTitle,
                  );
                  if (title) {
                    await supabase
                      .from('chat_conversations')
                      .update({ title })
                      .eq('id', finalConversationId);
                  }
                }
              }
            } catch {
              // Non-fatal — the user already got the answer over the wire.
              console.error('[course-chat] failed to save generated response');
            }
          }

          emit(controller, {
            type: 'done',
            conversation_id: finalConversationId,
            tokens: usage,
            rate_limit: { remaining: rate.remaining, per_hour: RATE_LIMIT_PER_HOUR },
          });
          controller.close();
        }
      },
    });

    return new Response(ndjsonStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    console.error('[course-chat] generation failed');
    return NextResponse.json({ error: 'Course chat is temporarily unavailable. Please try again later.' }, { status: 502 });
  }
}

/* ------------------------------------------------------------------ */
/* GET — resume the most recent non-archived conversation             */
/* ------------------------------------------------------------------ */

export async function GET(request: Request) {
  const unavailable = courseChatUnavailableResponse();
  if (unavailable) return unavailable;

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const courseId = url.searchParams.get('courseId');

  if (action !== 'resume' || !z.string().uuid().safeParse(courseId).success) {
    return NextResponse.json(
      { error: 'expected ?action=resume&courseId=<uuid>' },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  const { data: conv } = await supabase
    .from('chat_conversations')
    .select('id, title, created_at, last_message_at')
    .eq('course_id', courseId)
    .eq('is_archived', false)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conv) {
    return NextResponse.json({ conversation: null, messages: [] });
  }

  const { data: messages, error: msgErr } = await supabase
    .from('chat_messages')
    .select('id, role, content, citations, created_at')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true });

  if (msgErr) {
    return NextResponse.json({ error: 'failed to load conversation messages' }, { status: 500 });
  }

  return NextResponse.json({
    conversation: conv,
    messages: messages ?? [],
  });
}

/* ------------------------------------------------------------------ */
/* PATCH — archive a conversation (soft close, preserves history)     */
/* ------------------------------------------------------------------ */

export async function PATCH(request: Request) {
  const unavailable = courseChatUnavailableResponse();
  if (unavailable) return unavailable;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'expected body { conversationId, action: "archive" }' },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  const { error, count } = await supabase
    .from('chat_conversations')
    .update({ is_archived: true }, { count: 'exact' })
    .eq('id', parsed.data.conversationId);

  if (error) {
    return NextResponse.json({ error: 'failed to archive conversation' }, { status: 500 });
  }
  if ((count ?? 0) === 0) {
    // RLS filtered it out — either wrong owner or it doesn't exist. Either
    // way, treat as 404 from the caller's point of view.
    return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
