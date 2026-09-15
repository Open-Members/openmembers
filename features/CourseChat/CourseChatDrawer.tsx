'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  History as HistoryIcon,
  Loader2,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { chatResponseError, type ChatError } from './errors';
import SiriOrb from './SiriOrb';

interface Citation {
  lesson_id: string;
  lesson_title: string;
  lesson_slug: string;
  course_slug: string;
  start_seconds: number;
  end_seconds: number;
  similarity: number;
}

interface ConversationSummary {
  id: string;
  title: string | null;
  preview: string | null;
  is_archived: boolean;
  created_at: string;
  last_message_at: string;
}

function formatRelativeTime(iso: string, locale: string, justNow: string, unknown: string): string {
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return unknown;
  const diffMin = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diffMin < 1) return justNow;
  if (diffMin < 60) return relative.format(-diffMin, 'minute');
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return relative.format(-diffH, 'hour');
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return relative.format(-diffD, 'day');
  return then.toLocaleDateString(locale);
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

interface ChatDrawerProps {
  courseId: string;
  courseTitle: string;
  suggestions?: string[];
}

// Match both the canonical `[Lesson: "Title" @ M:SS]` that the prompt
// requests and Claude's common shorthand `[Title @ M:SS]`. We strip the
// optional `Lesson:` prefix and any surrounding straight or smart quotes
// before looking up the citation by title.
const CITATION_REGEX = /\[([^\]]+?)\s*@\s*(\d{1,3}):(\d{2})\]/g;

function cleanCitationTitle(raw: string): string {
  return raw
    .trim()
    .replace(/^Lesson:\s*/i, '')
    .replace(/^["“'']|["”'']$/g, '')
    .trim();
}

function formatTs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Inline renderers                                                   */
/* ------------------------------------------------------------------ */

function renderInline(text: string, key: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={`${key}-b-${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={`${key}-i-${i++}`}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <span key={key}>{parts}</span>;
}

function AssistantBody({
  content,
  citations,
  onCitationClick,
  isStreaming = false,
}: {
  content: string;
  citations: Citation[];
  onCitationClick: (c: Citation, startSeconds: number) => void;
  /** When true, renders a blinking caret at the end of the last paragraph. */
  isStreaming?: boolean;
}) {
  const t = useTranslations('courseChat.citations');
  const citationByTitle = useMemo(() => {
    const map = new Map<string, Citation>();
    for (const c of citations) map.set(c.lesson_title, c);
    return map;
  }, [citations]);

  const paragraphs = content.split(/\n{2,}/).filter((p) => p.trim());

  return (
    <div className="space-y-3 text-[15px] leading-[1.65] text-[var(--color-foreground)]">
      {paragraphs.map((para, pIdx) => {
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        para.replace(CITATION_REGEX, (match, rawTitle, mm, ss, offset) => {
          if (offset > lastIndex) {
            parts.push(renderInline(para.slice(lastIndex, offset), `${pIdx}-pre-${offset}`));
          }
          const title = cleanCitationTitle(rawTitle);
          const startSec = Number(mm) * 60 + Number(ss);
          const citation = citationByTitle.get(title);
          parts.push(
            <button
              key={`${pIdx}-cite-${offset}`}
              type="button"
              onClick={() => citation && onCitationClick(citation, startSec)}
              disabled={!citation}
              title={citation ? t('jump') : t('missing')}
              className="group/cite mx-0.5 inline-flex items-center gap-1 rounded-md bg-gradient-to-br from-[var(--color-primary-50)] to-[var(--color-primary-100)] px-1.5 py-0.5 text-[0.78rem] font-medium text-[var(--color-primary-700)] ring-1 ring-inset ring-[var(--color-primary-200)]/70 transition-all hover:-translate-y-0.5 hover:from-[var(--color-primary-100)] hover:to-[var(--color-primary-200)] hover:shadow-sm disabled:opacity-50 dark:from-[var(--color-primary-200)]/25 dark:to-[var(--color-primary-200)]/45 dark:text-[var(--color-primary-200)] dark:ring-[var(--color-primary)]/30 dark:hover:from-[var(--color-primary-200)]/40 dark:hover:to-[var(--color-primary-200)]/60"
            >
              <ArrowUpRight size={11} className="shrink-0 opacity-80 transition group-hover/cite:opacity-100" />
              <span className="truncate max-w-[14rem]">{title}</span>
              <span className="tabular-nums text-[var(--color-primary-500)]/80 dark:text-[var(--color-primary)]/90">
                {formatTs(startSec)}
              </span>
            </button>,
          );
          lastIndex = offset + match.length;
          return match;
        });
        if (lastIndex < para.length) {
          parts.push(renderInline(para.slice(lastIndex), `${pIdx}-tail`));
        }
        const isLast = pIdx === paragraphs.length - 1;
        return (
          <p key={pIdx}>
            {parts}
            {isLast && isStreaming && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-[1em] w-[0.5ch] translate-y-[2px] animate-pulse bg-[var(--color-primary)]/70 align-middle"
              />
            )}
          </p>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Typing indicator (three bouncing dots + orb)                       */
/* ------------------------------------------------------------------ */

function ThinkingIndicator() {
  const t = useTranslations('courseChat');
  return (
    <div role="status" className="flex items-center gap-3">
      <SiriOrb size={22} state="thinking" noHalo />
      <div className="flex items-center gap-1.5 text-[13px] text-[var(--color-muted-foreground)]">
        <span>{t('reading')}</span>
        <span className="inline-flex gap-0.5">
          <span className="h-1 w-1 animate-[chat-dot_1.2s_ease-in-out_infinite] rounded-full bg-[var(--color-primary)]" />
          <span
            className="h-1 w-1 animate-[chat-dot_1.2s_ease-in-out_infinite] rounded-full bg-[var(--color-primary)]"
            style={{ animationDelay: '0.18s' }}
          />
          <span
            className="h-1 w-1 animate-[chat-dot_1.2s_ease-in-out_infinite] rounded-full bg-[var(--color-primary)]"
            style={{ animationDelay: '0.36s' }}
          />
        </span>
      </div>
      <style jsx global>{`
        @keyframes chat-dot {
          0%, 80%, 100% {
            opacity: 0.2;
            transform: translateY(0);
          }
          40% {
            opacity: 1;
            transform: translateY(-3px);
          }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main drawer                                                        */
/* ------------------------------------------------------------------ */

export default function CourseChatDrawer({
  courseId,
  courseTitle,
  suggestions,
}: ChatDrawerProps) {
  const router = useRouter();
  const t = useTranslations('courseChat');
  const locale = useLocale();
  const promptSuggestions = suggestions ?? [t('suggestions.topics'), t('suggestions.summary'), t('suggestions.remember')];
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [resetting, setResetting] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loadingResume, setLoadingResume] = useState(false);

  // History panel state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const historyRequestRef = useRef(0);
  const leaveHistory = useCallback(() => {
    historyRequestRef.current += 1;
    setLoadingConversations(false);
    setHistoryOpen(false);
  }, []);
  const closeDrawer = useCallback(() => {
    historyRequestRef.current += 1;
    setLoadingConversations(false);
    setHistoryOpen(false);
    setOpen(false);
  }, []);
  useEffect(() => () => { historyRequestRef.current += 1; }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  // Conversation id we're currently threaded into. null = not-yet-created;
  // next POST will spawn a new chat_conversations row server-side.
  const conversationIdRef = useRef<string | null>(null);
  // Resume (fetch last conversation from server) fires exactly once per
  // component lifetime — reopening the drawer shouldn't wipe in-memory state.
  const resumeAttemptedRef = useRef(false);

  // --- Auto-grow textarea (respects max-height) ---------------------
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [input, open]);

  // --- Smart scroll: only stick if the user is near the bottom ------
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 80;
  }, []);

  useEffect(() => {
    if (!scrollRef.current || !stickToBottomRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // --- Focus on open ------------------------------------------------
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 160);
  }, [open]);

  // --- Resume last conversation on first drawer open (component lifetime).
  // We only hit the server once; subsequent opens rely on in-memory state.
  useEffect(() => {
    if (!open || resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;

    (async () => {
      setLoadingResume(true);
      try {
        const res = await fetch(
          `/api/course-chat?courseId=${encodeURIComponent(courseId)}&action=resume`,
        );
        if (!res.ok) {
          setError(await chatResponseError(res, 'resume'));
          return;
        }
        const json = (await res.json()) as {
          conversation: { id: string } | null;
          messages: Array<{
            id: string;
            role: 'user' | 'assistant';
            content: string;
            citations?: unknown;
          }>;
        };
        if (json.conversation && Array.isArray(json.messages) && json.messages.length > 0) {
          conversationIdRef.current = json.conversation.id;
          setMessages(
            json.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              citations: Array.isArray(m.citations) ? (m.citations as Citation[]) : [],
            })),
          );
        }
      } catch {
        setError('resumeFailed');
      } finally {
        setLoadingResume(false);
      }
    })();
  }, [open, courseId]);

  // --- Close on Escape ----------------------------------------------
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeDrawer]);

  // --- Submit -------------------------------------------------------
  const submit = useCallback(
    async (message: string) => {
      if (!message.trim() || sending || loadingResume || resetting) return;
      setError(null);
      stickToBottomRef.current = true;
      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: message.trim(),
      };
      setMessages((m) => [...m, userMsg]);
      setInput('');
      setSending(true);

      // Send the last 8 messages as conversation history so Claude can
      // resolve follow-ups ("which module?", "more examples of that").
      const history = messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const assistantId = `a-${Date.now()}`;
      let assistantCreated = false;
      let streamFailed = false;
      let streamCompleted = false;
      let pendingCitations: Citation[] = [];

      try {
        const res = await fetch('/api/course-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseId,
            message: message.trim(),
            history,
            conversationId: conversationIdRef.current,
          }),
        });

        if (!res.ok) {
          setError(await chatResponseError(res, 'send'));
          return;
        }
        if (!res.body) {
          setError('noResponse');
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            let evt: Record<string, unknown>;
            try {
              evt = JSON.parse(line);
            } catch {
              continue;
            }

            switch (evt.type) {
              case 'citations': {
                const next = Array.isArray(evt.citations) ? (evt.citations as Citation[]) : [];
                pendingCitations = next;
                if (assistantCreated) {
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantId ? { ...m, citations: next } : m)),
                  );
                }
                break;
              }
              case 'delta': {
                const delta = typeof evt.content === 'string' ? evt.content : '';
                if (!delta) break;
                if (!assistantCreated) {
                  assistantCreated = true;
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: assistantId,
                      role: 'assistant',
                      content: delta,
                      citations: pendingCitations,
                    },
                  ]);
                } else {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: m.content + delta } : m,
                    ),
                  );
                }
                break;
              }
              case 'done': {
                streamCompleted = true;
                const rl = (evt.rate_limit ?? null) as { remaining?: number } | null;
                if (rl && typeof rl.remaining === 'number') {
                  setRemaining(rl.remaining);
                }
                const cid = typeof evt.conversation_id === 'string' ? evt.conversation_id : null;
                if (cid) conversationIdRef.current = cid;
                break;
              }
              case 'error': {
                streamFailed = true;
                setError('interrupted');
                break;
              }
            }
          }
        }

        if (!streamFailed && (!assistantCreated || !streamCompleted)) {
          setError(assistantCreated ? 'interrupted' : 'noResponse');
        }
      } catch {
        setError(assistantCreated ? 'interrupted' : 'sendFailed');
      } finally {
        setSending(false);
      }
    },
    [courseId, sending, messages, loadingResume, resetting],
  );

  // --- History panel actions --------------------------------------
  const openHistory = useCallback(async () => {
    const requestId = ++historyRequestRef.current;
    const isCurrent = () => historyRequestRef.current === requestId;
    setHistoryOpen(true);
    setLoadingConversations(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/course-chat/conversations?courseId=${encodeURIComponent(courseId)}`,
      );
      if (!res.ok) {
        const failure = await chatResponseError(res, 'history');
        if (isCurrent()) setError(failure);
        return;
      }
      const json = (await res.json()) as { conversations: ConversationSummary[] };
      if (!isCurrent()) return;
      if (!Array.isArray(json.conversations)) {
        setError('historyFailed');
        return;
      }
      setConversations(json.conversations);
    } catch {
      if (isCurrent()) setError('historyFailed');
    } finally {
      if (isCurrent()) setLoadingConversations(false);
    }
  }, [courseId]);

  const loadConversation = useCallback(async (id: string) => {
    setLoadingResume(true);
    setError(null);
    try {
      const res = await fetch(`/api/course-chat/conversations/${id}`);
      if (!res.ok) {
        setError(await chatResponseError(res, 'load'));
        return;
      }
      const json = (await res.json()) as {
        conversation: { id: string } | null;
        messages: Array<{
          id: string;
          role: 'user' | 'assistant';
          content: string;
          citations?: unknown;
        }>;
      };
      if (!json.conversation || !Array.isArray(json.messages)) {
        setError('loadFailed');
        return;
      }
      conversationIdRef.current = json.conversation.id;
      setMessages(
        json.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          citations: Array.isArray(m.citations) ? (m.citations as Citation[]) : [],
        })),
      );
      leaveHistory();
      stickToBottomRef.current = true;
    } catch {
      setError('loadFailed');
    } finally {
      setLoadingResume(false);
    }
  }, [leaveHistory]);

  const deleteConversation = useCallback(
    async (id: string) => {
      setDeletingIds((s) => new Set(s).add(id));
      setError(null);
      try {
        const res = await fetch(`/api/course-chat/conversations/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          setError(await chatResponseError(res, 'delete'));
          return;
        }
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (conversationIdRef.current === id) {
          setMessages([]);
          conversationIdRef.current = null;
        }
      } catch {
        setError('deleteFailed');
      } finally {
        setDeletingIds((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    },
    [],
  );

  const resetConversation = useCallback(async () => {
    const currentId = conversationIdRef.current;
    setResetting(true);
    setError(null);
    try {
      if (currentId) {
        const res = await fetch('/api/course-chat', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: currentId, action: 'archive' }),
        });
        if (!res.ok) {
          setError(await chatResponseError(res, 'archive'));
          return;
        }
      }
      setMessages([]);
      conversationIdRef.current = null;
      stickToBottomRef.current = true;
    } catch {
      setError('archiveFailed');
    } finally {
      setResetting(false);
    }
  }, []);

  const handleCitationClick = useCallback(
    (c: Citation, startSeconds: number) => {
      closeDrawer();
      router.push(`/courses/${c.course_slug}/${c.lesson_slug}?t=${startSeconds}`);
    },
    [router, closeDrawer],
  );

  /* ---------------------------------------------------------------- */

  return (
    <>
      {/* Floating trigger — orb + text, no box */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('title')}
        className="group fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full px-1 py-1 transition-transform duration-300 ease-out hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-300)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--color-background)] motion-reduce:transition-none"
      >
        {/* Orb — continuous organic breath animation, amplifies on hover
            without changing rotation speed or container size. Rotation
            stays constant via SiriOrb's own 6s loop (no state swap on
            hover, because the speed jump felt jarring). */}
        <span className="relative block">
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-full bg-[var(--color-primary)]/15 opacity-0 blur-md transition-opacity duration-300 ease-out group-hover:opacity-100 motion-reduce:transition-none"
          />
          <span className="trigger-orb-breath relative block">
            <SiriOrb size={36} />
          </span>
        </span>

        {/* Text — multi-layer visibility: soft backdrop + text-shadow + drop-shadow */}
        <span className="relative inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-x-3 -inset-y-1.5 rounded-full bg-[var(--color-card)]/45 backdrop-blur-md transition-all duration-300 ease-out group-hover:bg-[var(--color-card)]/75 group-hover:-inset-x-3.5 motion-reduce:transition-none"
          />
          <span
            className="relative text-sm font-semibold tracking-tight text-[var(--color-foreground)] [text-shadow:0_0_12px_var(--color-card),0_1px_2px_rgba(0,0,0,0.08)] dark:[text-shadow:0_1px_3px_rgba(0,0,0,0.7),0_0_1px_rgba(0,0,0,0.5)]"
          >
            {t('title')}
          </span>
          <ArrowUpRight
            size={14}
            strokeWidth={2.5}
            className="relative -translate-x-1 text-[var(--color-primary)] opacity-0 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-90 motion-reduce:transition-none"
          />
        </span>

        <style jsx global>{`
          @property --trigger-breath-max {
            syntax: '<number>';
            initial-value: 1.03;
            inherits: false;
          }
          .trigger-orb-breath {
            --trigger-breath-max: 1.03;
            animation: trigger-orb-breath 2.6s ease-in-out infinite;
            transition: --trigger-breath-max 400ms ease-out;
            will-change: transform;
            transform-origin: center center;
          }
          .group:hover .trigger-orb-breath {
            --trigger-breath-max: 1.06;
          }
          @keyframes trigger-orb-breath {
            0%, 100% { transform: scale(1); }
            50%      { transform: scale(var(--trigger-breath-max)); }
          }
          @media (prefers-reduced-motion: reduce) {
            .trigger-orb-breath { animation: none; }
          }
        `}</style>
      </button>

      {/* Backdrop — explicit dark overlay in both modes. We can't use
          var(--color-foreground) because in dark it's off-white and would
          brighten the backdrop instead of dimming it. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[3px] transition-opacity dark:bg-black/70"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* Drawer — glass panel */}
      <aside
        className={`course-chat-drawer fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-[28rem] flex-col border-l border-white/20 dark:border-white/5 bg-[var(--color-card)]/80 shadow-[0_0_60px_-20px_rgba(2,53,168,0.45)] backdrop-blur-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-hidden={!open}
        inert={!open}
        aria-label={t('title')}
      >
        {/* Scoped reset: kill Safari's amber focus outline on any element
            inside the drawer. We still render custom focus-visible rings
            on interactive targets (send button, form), so keyboard users
            don't lose affordance. */}
        <style jsx global>{`
          .course-chat-drawer *:focus {
            outline: none;
          }
          .course-chat-drawer textarea {
            -webkit-appearance: none;
            appearance: none;
            -webkit-tap-highlight-color: transparent;
          }
          /* Custom scrollbar — default macOS chrome shows as a bright
             overlay bar on the dark panel and breaks the glass feel. */
          .course-chat-drawer ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }
          .course-chat-drawer ::-webkit-scrollbar-track {
            background: transparent;
          }
          .course-chat-drawer ::-webkit-scrollbar-thumb {
            background: var(--color-border);
            border-radius: 4px;
          }
          .course-chat-drawer ::-webkit-scrollbar-thumb:hover {
            background: var(--color-muted-foreground);
          }
          .dark .course-chat-drawer ::-webkit-scrollbar-thumb {
            background: #2a2c33;
          }
          .dark .course-chat-drawer ::-webkit-scrollbar-thumb:hover {
            background: #3b3d44;
          }
          /* Firefox */
          .course-chat-drawer {
            scrollbar-width: thin;
            scrollbar-color: var(--color-border) transparent;
          }
          .dark .course-chat-drawer {
            scrollbar-color: #2a2c33 transparent;
          }
        `}</style>
        {/* Subtle gradient border accent on the left edge */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full w-px bg-gradient-to-b from-[var(--color-primary)]/50 via-[var(--color-accent)]/30 to-[var(--color-accent)]/30"
        />

        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <SiriOrb size={32} />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold tracking-tight text-[var(--color-foreground)]">
                {t('title')}
              </div>
              <div className="truncate text-[12px] text-[var(--color-muted-foreground)]">
                {courseTitle}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!historyOpen && (
              <button
                type="button"
                onClick={openHistory}
                disabled={sending || loadingResume || resetting}
                aria-label={t('history.title')}
                title={t('history.title')}
                className="grid size-8 place-items-center rounded-full text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              >
                <HistoryIcon size={14} />
              </button>
            )}
            {!historyOpen && messages.length > 0 && (
              <button
                type="button"
                onClick={resetConversation}
                disabled={sending || loadingResume || resetting}
                aria-label={t('history.new')}
                title={t('history.new')}
                className="grid size-8 place-items-center rounded-full text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              >
                <RotateCcw size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={closeDrawer}
              aria-label={t('close')}
              className="grid size-8 place-items-center rounded-full text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mx-5 mb-3 rounded-xl border border-[var(--color-accent-200)] bg-[var(--color-accent-50)] px-3 py-2 text-[12px] text-[var(--color-accent-700)] dark:border-[var(--color-accent)]/40 dark:bg-[var(--color-accent)]/12 dark:text-[#fca5a5]">
            {t(`errors.${error}`)}
          </div>
        )}

        {/* History panel (takes over content area when open) */}
        {historyOpen ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Subheader with back button + count */}
            <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--color-border)]">
              <button
                type="button"
                onClick={leaveHistory}
                disabled={loadingResume || deletingIds.size > 0}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-muted-foreground)] transition hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              >
                <ChevronLeft size={14} />
                {t('history.back')}
              </button>
              <span className="ml-auto text-[11px] text-[var(--color-muted-foreground)]">
                {loadingConversations
                  ? t('history.loading')
                  : error ? null : t('history.count', { count: conversations.length })}
              </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {loadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={18} className="animate-spin text-[var(--color-primary)]" />
                </div>
              ) : conversations.length === 0 && !error ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <div className="grid size-10 place-items-center rounded-full bg-[var(--color-muted)]">
                    <HistoryIcon size={16} className="text-[var(--color-muted-foreground)]" />
                  </div>
                  <div className="text-[13px] text-[var(--color-muted-foreground)]">
                    {t('history.empty')}<br />{t('history.emptyHelp')}
                  </div>
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {conversations.map((c) => {
                    const isCurrent = c.id === conversationIdRef.current;
                    const isDeleting = deletingIds.has(c.id);
                    const heading = c.title ?? c.preview ?? t('history.untitled');
                    return (
                      <li
                        key={c.id}
                        className={`group/row relative overflow-hidden rounded-xl border transition-all ${
                          isCurrent
                            ? 'border-[var(--color-primary-300)] bg-[var(--color-primary-50)]/80 dark:border-[var(--color-primary)]/40 dark:bg-[var(--color-primary)]/10'
                            : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-muted)]'
                        } ${isDeleting ? 'pointer-events-none opacity-50' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => loadConversation(c.id)}
                          disabled={loadingResume || deletingIds.size > 0}
                          className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[14px] font-medium text-[var(--color-foreground)]">
                                {heading}
                              </span>
                              {c.is_archived && (
                                <span className="shrink-0 rounded-full bg-[var(--color-muted)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                                  {t('history.archived')}
                                </span>
                              )}
                              {isCurrent && (
                                <span className="shrink-0 rounded-full bg-[var(--color-primary)]/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-primary-700)] dark:text-[var(--color-primary)]">
                                  {t('history.active')}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
                              <span>{formatRelativeTime(c.last_message_at, locale, t('time.justNow'), t('time.unknown'))}</span>
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(t('history.deleteConfirm'))) {
                              void deleteConversation(c.id);
                            }
                          }}
                          aria-label={t('history.delete')}
                          disabled={loadingResume || deletingIds.size > 0}
                          className="absolute right-2 top-1/2 -translate-y-1/2 grid size-7 place-items-center rounded-full text-[var(--color-muted-foreground)] opacity-0 transition hover:bg-[var(--color-accent)]/15 hover:text-[var(--color-accent)] group-hover/row:opacity-100 focus-visible:opacity-100"
                        >
                          {isDeleting ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <>

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 pb-2"
        >
          {loadingResume ? (
            <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 size={18} className="animate-spin" />
              {t('history.loadingConversation')}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 py-8 text-center">
              <SiriOrb size="xl" />
              <div className="space-y-1.5">
                <h2 className="text-[22px] font-semibold tracking-tight text-[var(--color-foreground)]">
                  {t('empty.title')}
                </h2>
                <p className="mx-auto max-w-[22rem] text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {t('empty.description')}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 pt-1">
                {promptSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    disabled={sending || loadingResume || resetting}
                    className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/60 px-4 py-3 text-left text-[14px] text-[var(--color-foreground)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary-200)] hover:bg-[var(--color-primary-50)]/80 hover:shadow-sm"
                  >
                    <span className="block">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5 pt-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === 'user' ? 'flex justify-end' : 'relative pl-4'
                  }
                >
                  {m.role === 'user' ? (
                    <div className="max-w-[85%] rounded-[18px] rounded-br-md bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-hover)] px-4 py-2.5 text-[15px] font-medium leading-[1.55] text-[var(--color-primary-foreground)] shadow-sm dark:from-[var(--color-primary)] dark:to-[var(--color-primary-hover)]/85 ">
                      {m.content}
                    </div>
                  ) : (
                    <>
                      {/* Subtle vertical accent bar instead of a bubble */}
                      <span
                        aria-hidden
                        className="absolute left-0 top-1 h-full w-0.5 rounded-full bg-gradient-to-b from-[var(--color-primary)] via-[var(--color-accent)] to-[var(--color-accent)] opacity-40"
                      />
                      <AssistantBody
                        content={m.content}
                        citations={m.citations ?? []}
                        onCitationClick={handleCitationClick}
                        isStreaming={
                          sending &&
                          messages[messages.length - 1]?.id === m.id
                        }
                      />
                    </>
                  )}
                </div>
              ))}
              {sending && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="relative pl-4">
                  <span
                    aria-hidden
                    className="absolute left-0 top-1 h-5 w-0.5 rounded-full bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-accent)] opacity-40"
                  />
                  <ThinkingIndicator />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <footer className="relative px-5 pb-5 pt-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="group/form flex items-end gap-2 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-3 shadow-[0_2px_10px_-4px_rgba(2,53,168,0.15)] transition-all focus-within:border-[var(--color-primary-300)] focus-within:shadow-[0_4px_18px_-4px_rgba(2,53,168,0.35)] focus-within:ring-2 focus-within:ring-[var(--color-primary-100)] dark:focus-within:ring-[var(--color-primary)]/25 dark:focus-within:shadow-[0_4px_18px_-4px_rgba(77,138,255,0.35)]"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={2}
              placeholder={sending ? t('thinking') : t('input.placeholder')}
              aria-label={t('input.label')}
              disabled={sending || loadingResume || resetting}
              autoComplete="off"
              autoCorrect="on"
              spellCheck
              className="flex-1 resize-none border-0 bg-transparent text-[15px] leading-[1.55] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)]/80 focus:outline-none focus:ring-0 disabled:opacity-50"
              style={{ maxHeight: '40vh', minHeight: '2.8rem' }}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending || loadingResume || resetting}
              aria-label={t('input.send')}
              className="grid size-10 shrink-0 place-items-center self-end rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-hover)] text-[var(--color-primary-foreground)] shadow-sm transition-all hover:-translate-y-0.5  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-300)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50 disabled:shadow-none disabled:hover:translate-y-0 dark:from-[var(--color-primary)] dark:to-[var(--color-primary-hover)]  "
            >
              <Send size={15} strokeWidth={2.3} />
            </button>
          </form>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[11px] text-[var(--color-muted-foreground)]">
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 font-sans text-[10px]">
                {t('input.enter')}
              </kbd>
              {t('input.toSend')}
              <span className="opacity-50">·</span>
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1.5 py-0.5 font-sans text-[10px]">
                {t('input.shiftEnter')}
              </kbd>
              {t('input.newline')}
            </span>
            {remaining !== null && (
              <span className="tabular-nums">{t('input.remaining', { count: remaining })}</span>
            )}
          </div>
        </footer>
        </>
        )}
      </aside>
    </>
  );
}
