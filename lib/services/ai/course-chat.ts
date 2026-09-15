/**
 * RAG retrieval + prompt builder for the Ask-the-Course feature.
 *
 * retrieveContext() runs a pgvector cosine-similarity search scoped to a
 * single course and returns the top-K chunks with rich lesson + module
 * metadata so the caller can ground Claude's response, produce clickable
 * [Lesson Title @ M:SS] citations, AND answer follow-up questions about
 * course structure ("which module is this lesson in?").
 *
 * For follow-up questions that depend on conversational context ("give me
 * more examples of that"), retrieveContext accepts an optional
 * `priorUserMessage` that is concatenated with the current query before
 * embedding — this keeps the retrieval anchored to the topic under
 * discussion even when the new question is phrased obliquely.
 */
import { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { embedOne, type ChatMessage } from './gateway';

let poolInstance: Pool | null = null;
function pool(): Pool {
  if (!poolInstance) {
    // Prefer the configured pooler; direct database connections are optional.
    // Initialization is deferred until an authenticated request needs retrieval.
    const url = process.env.DATABASE_POOL_URL?.trim() || process.env.DATABASE_URL?.trim();
    if (!url) throw new Error('DATABASE_POOL_URL / DATABASE_URL is not set');
    poolInstance = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  }
  return poolInstance;
}

export interface RetrievedChunk {
  lesson_id: string;
  lesson_title: string;
  lesson_slug: string;
  lesson_sort_order: number;
  module_id: string;
  module_title: string;
  module_sort_order: number;
  course_slug: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
  similarity: number;
}

export async function retrieveContext(
  courseId: string,
  query: string,
  session: SupabaseClient,
  opts: {
    topK?: number;
    /** Last user message, used to enrich the embedding query for follow-ups. */
    priorUserMessage?: string;
  } = {},
): Promise<RetrievedChunk[]> {
  // The pg connection is privileged. Resolve the allowlist through the caller's
  // session first so publication, suspension, expiry and drip RLS still apply.
  const { data: lessons, error } = await session
    .from('lessons')
    .select('id, modules!inner(course_id)')
    .eq('modules.course_id', courseId);
  if (error || !lessons) throw new Error('Could not authorize course context');
  const lessonIds = lessons.map((lesson) => lesson.id);
  if (lessonIds.length === 0) return [];

  // An empty installation must not send student questions to the AI provider.
  // Scope the readiness query to the same authorized lesson allowlist.
  const { rows: corpus } = await pool().query(
    `SELECT 1 FROM lesson_chunks
     WHERE lesson_id = ANY($1::uuid[]) AND embedding IS NOT NULL AND btrim(text) <> ''
     LIMIT 1`,
    [lessonIds],
  );
  if (corpus.length === 0) return [];

  const topK = opts.topK ?? 5;

  // For follow-up questions ("more examples of that", "which module?") the
  // current query alone often embeds to the wrong neighbourhood. Concatenating
  // with the prior user message anchors the retrieval to the topic already
  // under discussion.
  const embeddingQuery = opts.priorUserMessage
    ? `${opts.priorUserMessage}\n\n${query}`
    : query;
  const embedding = await embedOne(embeddingQuery);
  const embeddingStr = '[' + embedding.join(',') + ']';

  const { rows } = await pool().query(
    `SELECT
       lc.lesson_id,
       l.title         AS lesson_title,
       l.slug          AS lesson_slug,
       l.sort_order    AS lesson_sort_order,
       m.id            AS module_id,
       m.title         AS module_title,
       m.sort_order    AS module_sort_order,
       c.slug          AS course_slug,
       lc.start_seconds,
       lc.end_seconds,
       lc.text,
       (1 - (lc.embedding <=> $1::vector))::float AS similarity
     FROM lesson_chunks lc
     JOIN lessons l ON l.id = lc.lesson_id
     JOIN modules m ON m.id = l.module_id
     JOIN courses c ON c.id = m.course_id
     WHERE m.course_id = $2 AND l.id = ANY($4::uuid[])
       AND lc.embedding IS NOT NULL AND btrim(lc.text) <> ''
     ORDER BY lc.embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, courseId, topK, lessonIds],
  );
  return rows as RetrievedChunk[];
}

function formatTimestamp(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const SYSTEM_PROMPT = `You are the AI tutor for the course "{COURSE_TITLE}" on a learning platform. Answer ONLY using the provided transcript excerpts and the course structure information inside each excerpt header. If the answer isn't in the excerpts, say so honestly and suggest related topics that ARE covered.

Rules:
- Answer in the language of the student question unless the student requests another language.
- Every claim drawn from an excerpt MUST be followed by a citation in EXACTLY this format — copy it verbatim including the "Lesson:" prefix and the straight double quotes:

    [Lesson: "Exact Lesson Title" @ M:SS]

  The lesson title inside the quotes must match the excerpt header character-for-character. Multiple citations per paragraph are fine.
- When the student asks about course structure (e.g. "which module is this lesson in?", "what comes after this?"), use the module and lesson ordering information in each excerpt header. You do NOT need to cite a timestamp for structural answers, but you MAY cite the specific lesson.
- Keep answers to 2-4 paragraphs max. Be direct and helpful.
- When the student uses vague references ("that lesson", "it", "this one"), resolve them using the earlier turns of the conversation that appear before your message. Always stay on topic with what was just discussed.
- If quoting the teacher directly, use quotation marks around the quote.
- Never fabricate. If the excerpts do not cover the question, explain this in the student's language and suggest a related topic only when it is supported by the excerpts.`;

/**
 * Cap a conversation history to the N most recent messages. Keeps the
 * prompt within a sensible token budget and preserves alternating
 * user/assistant order from whatever the caller provides.
 */
function trimHistory(history: ChatMessage[], maxMessages: number): ChatMessage[] {
  if (history.length <= maxMessages) return history;
  return history.slice(-maxMessages);
}

export function buildMessages(
  courseTitle: string,
  query: string,
  chunks: RetrievedChunk[],
  history: ChatMessage[] = [],
  opts: { maxHistory?: number } = {},
): ChatMessage[] {
  const maxHistory = opts.maxHistory ?? 8;

  const contextBlocks = chunks
    .map((c) => {
      // Header carries module + lesson position so the model can answer
      // structural questions without an extra DB roundtrip.
      const header = `[Lesson: "${c.lesson_title}" — Module ${c.module_sort_order}: "${c.module_title}", lesson #${c.lesson_sort_order} @ ${formatTimestamp(c.start_seconds)}]`;
      return `${header}\n${c.text.trim()}`;
    })
    .join('\n\n---\n\n');

  const systemMsg = SYSTEM_PROMPT.replace('{COURSE_TITLE}', courseTitle);

  const userMsg = contextBlocks
    ? `CONTEXT from transcripts (top ${chunks.length} most relevant excerpts — the header tells you which module and position each lesson has):\n\n${contextBlocks}\n\nSTUDENT QUESTION: ${query}`
    : `No transcript excerpts were retrieved for this question.\n\nSTUDENT QUESTION: ${query}`;

  return [
    { role: 'system', content: systemMsg },
    ...trimHistory(history, maxHistory),
    { role: 'user', content: userMsg },
  ];
}

/**
 * Check and increment the per-user hourly rate limit. Returns true if the
 * request is within budget, false if it has been exceeded. The bucket key
 * is the start of the current hour (UTC).
 */
export async function checkAndBumpRateLimit(
  userId: string,
  limitPerHour: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const client = await pool().connect();
  try {
    const windowSql = `date_trunc('hour', now())`;
    const { rows } = await client.query(
      `INSERT INTO chat_rate_limits (user_id, window_start, message_count)
       VALUES ($1, ${windowSql}, 1)
       ON CONFLICT (user_id, window_start)
       DO UPDATE SET message_count = chat_rate_limits.message_count + 1
       RETURNING message_count`,
      [userId],
    );
    const count = rows[0].message_count as number;
    return { allowed: count <= limitPerHour, remaining: Math.max(0, limitPerHour - count) };
  } finally {
    client.release();
  }
}
