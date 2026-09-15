'use client';

import { useEffect, useState, useTransition, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl';
import { AlertCircle, MessageSquare, Pin, Trash2, Reply, Send, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useBrowserTimezone } from '@/shared/hooks/useBrowserTimezone';
import { addComment, deleteComment, pinComment, fetchComments } from '../actions';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import type { LessonComment } from '@/shared/types/interfaces';
import { commentErrorCode, type CommentErrorCode } from '../errors';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CommentSectionProps {
  lessonId: string;
  currentUserId: string;
  isAdmin?: boolean;
}

// ─── Avatar helper ──────────────────────────────────────────────────────────

function CommentAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return avatarUrl ? (
    <Image
      src={avatarUrl}
      alt={name}
      width={32}
      height={32}
      unoptimized
      className="h-8 w-8 rounded-full object-cover shrink-0"
    />
  ) : (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary-50)] text-xs font-bold text-[var(--color-primary)] shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Single Comment ─────────────────────────────────────────────────────────

function CommentItem({
  comment,
  currentUserId,
  isAdmin,
  onReply,
  onDelete,
  onPin,
  isPending,
}: {
  comment: LessonComment;
  currentUserId: string;
  isAdmin: boolean;
  onReply: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onPin: (commentId: string) => void;
  isPending: boolean;
}) {
  const t = useTranslations('comments');
  const locale = useLocale();
  const format = useFormatter();
  const timeZone = useBrowserTimezone() ?? 'UTC';
  const now = useNow({ updateInterval: 60_000 });
  const isOwn = comment.userId === currentUserId;
  const displayName = comment.userDisplayName ?? t('anonymous');
  const date = new Date(comment.createdAt);
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  const createdAt = Number.isNaN(date.getTime()) ? t('unknownDate')
    : seconds < 60 ? t('justNow')
      : seconds < 3600 ? relative.format(-Math.floor(seconds / 60), 'minute')
        : seconds < 86400 ? relative.format(-Math.floor(seconds / 3600), 'hour')
          : seconds < 86400 * 30 ? relative.format(-Math.floor(seconds / 86400), 'day')
            : format.dateTime(date, { year: 'numeric', month: 'numeric', day: 'numeric', timeZone });

  return (
    <div className={cn(
      'group flex gap-3',
      comment.isPinned && 'rounded-lg bg-amber-50/50 dark:bg-amber-950/20 p-3 -mx-3',
    )}>
      <CommentAvatar name={displayName} avatarUrl={comment.userAvatarUrl} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[var(--color-foreground)]">
            {displayName}
          </span>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {createdAt}
          </span>
          {comment.isPinned && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">
              <Pin className="w-2.5 h-2.5" />
              {t('pinned')}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--color-foreground)] whitespace-pre-wrap break-words">
          {comment.content}
        </p>
        <div className="mt-1.5 flex items-center gap-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
          {/* Reply button — only for top-level comments */}
          {!comment.parentId && (
            <button
              type="button"
              onClick={() => onReply(comment.id)}
              className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors"
            >
              <Reply className="w-3 h-3" />
              {t('reply')}
            </button>
          )}
          {/* Delete button — own comments or admin */}
          {(isOwn || isAdmin) && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              disabled={isPending}
              className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-red-500 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              {t('delete')}
            </button>
          )}
          {/* Pin button — admin only */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onPin(comment.id)}
              disabled={isPending}
              className={cn(
                'flex items-center gap-1 text-xs transition-colors disabled:opacity-50',
                comment.isPinned
                  ? 'text-amber-500 hover:text-amber-600'
                  : 'text-[var(--color-muted-foreground)] hover:text-amber-500',
              )}
            >
              <Pin className="w-3 h-3" />
              {comment.isPinned ? t('unpin') : t('pin')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Comment Form ───────────────────────────────────────────────────────────

function CommentForm({
  lessonId,
  parentId,
  onSubmitted,
  onCancel,
  placeholder,
}: {
  lessonId: string;
  parentId?: string;
  onSubmitted: () => void;
  onCancel?: () => void;
  placeholder?: string;
}) {
  const t = useTranslations('comments');
  const [content, setContent] = useState('');
  const [error, setError] = useState<CommentErrorCode | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!content.trim()) return;
    setError(null);

    const formData = new FormData();
    formData.set('lessonId', lessonId);
    formData.set('content', content.trim());
    if (parentId) formData.set('parentId', parentId);

    startTransition(async () => {
      try {
        const result = await addComment(formData);
        if (result?.success) {
          setContent('');
          onSubmitted();
        } else {
          setError(commentErrorCode(result?.error, 'saveFailed'));
        }
      } catch {
        setError('saveFailed');
      }
    });
  };

  return (
    <div className="flex gap-3">
      <div className="flex-1">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={placeholder ?? t('placeholder')}
          aria-label={parentId ? t('replyLabel') : t('commentLabel')}
          rows={2}
          className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        {error && (
          <div role="alert" className="mt-2 flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="break-words">{t(`errors.${error}`)}</span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-end gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
            >
              {t('cancel')}
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !content.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            {isPending ? t('sending') : parentId ? t('reply') : t('submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main CommentSection ────────────────────────────────────────────────────

export function CommentSection(props: CommentSectionProps) {
  return <LessonComments key={props.lessonId} {...props} />;
}

function LessonComments({ lessonId, currentUserId, isAdmin = false }: CommentSectionProps) {
  const t = useTranslations('comments');
  const [comments, setComments] = useState<LessonComment[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<CommentErrorCode | null>(null);
  const [loadError, setLoadError] = useState<CommentErrorCode | null>(null);

  const requestVersion = useRef(0);

  const loadComments = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const result = await fetchComments(lessonId);
      if (version !== requestVersion.current) return;
      if (result.error) setLoadError(commentErrorCode(result.error, 'loadFailed'));
      else {
        setComments(result.data);
        setLoadError(null);
      }
      setLoading(false);
    } catch {
      if (version !== requestVersion.current) return;
      setLoadError('loadFailed');
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    const version = ++requestVersion.current;
    fetchComments(lessonId).then(
      (result) => {
        if (version !== requestVersion.current) return;
        if (result.error) setLoadError(commentErrorCode(result.error, 'loadFailed'));
        else {
          setComments(result.data);
          setLoadError(null);
        }
        setLoading(false);
      },
      () => {
        if (version !== requestVersion.current) return;
        setLoadError('loadFailed');
        setLoading(false);
      },
    );
    return () => { requestVersion.current += 1; };
  }, [lessonId]);

  const handleDelete = (commentId: string) => {
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await deleteComment(commentId);
        if (result?.success) await loadComments();
        else setActionError(commentErrorCode(result?.error, 'deleteFailed'));
      } catch {
        setActionError('deleteFailed');
      }
    });
  };

  const handlePin = (commentId: string) => {
    setActionError(null);
    startTransition(async () => {
      try {
        const result = await pinComment(commentId);
        if (result?.success) await loadComments();
        else setActionError(commentErrorCode(result?.error, 'pinFailed'));
      } catch {
        setActionError('pinFailed');
      }
    });
  };

  const handleCommentSubmitted = () => {
    setReplyingTo(null);
    loadComments();
  };

  // Separate top-level comments and replies
  const topLevel = comments.filter(c => !c.parentId);
  const repliesByParent = new Map<string, LessonComment[]>();
  for (const c of comments.filter(c => c.parentId)) {
    const list = repliesByParent.get(c.parentId!) ?? [];
    list.push(c);
    repliesByParent.set(c.parentId!, list);
  }

  if (loading) {
    return (
      <div role="status" aria-label={t('loading')} className="space-y-4 animate-pulse">
        <div className="h-20 rounded-lg bg-[var(--color-muted)]" />
        <div className="h-16 rounded-lg bg-[var(--color-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-[var(--color-primary)]" />
        <h3 id="lesson-comments-title" className="text-lg font-bold text-[var(--color-foreground)]">
          {topLevel.length > 0 ? t('titleWithCount', { count: topLevel.length }) : t('title')}
        </h3>
      </div>

      {actionError && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t(`errors.${actionError}`)}</span>
        </div>
      )}

      {/* Add comment form */}
      <CommentForm
        lessonId={lessonId}
        onSubmitted={handleCommentSubmitted}
        placeholder={t('lessonPlaceholder')}
      />

      {/* Comments list */}
      {loadError ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">{t(`errors.${loadError}`)}</p>
          <button type="button" disabled={isPending} onClick={() => startTransition(async () => { await loadComments(); })} className="text-sm font-medium text-[var(--color-primary)] disabled:opacity-50">
            {t('retry')}
          </button>
        </div>
      ) : topLevel.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          tone="inline"
          compact
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <div className="space-y-5">
          {topLevel.map(comment => (
            <div key={comment.id}>
              <CommentItem
                comment={comment}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onReply={id => setReplyingTo(replyingTo === id ? null : id)}
                onDelete={handleDelete}
                onPin={handlePin}
                isPending={isPending}
              />

              {/* Replies */}
              {(repliesByParent.get(comment.id) ?? []).length > 0 && (
                <div className="ml-11 mt-3 space-y-3 border-l-2 border-[var(--color-border)] pl-4">
                  {(repliesByParent.get(comment.id) ?? []).map(reply => (
                    <CommentItem
                      key={reply.id}
                      comment={reply}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                      onReply={() => setReplyingTo(comment.id)}
                      onDelete={handleDelete}
                      onPin={handlePin}
                      isPending={isPending}
                    />
                  ))}
                </div>
              )}

              {/* Reply form */}
              {replyingTo === comment.id && (
                <div className="ml-11 mt-3 pl-4">
                  <CommentForm
                    lessonId={lessonId}
                    parentId={comment.id}
                    onSubmitted={handleCommentSubmitted}
                    onCancel={() => setReplyingTo(null)}
                    placeholder={t('replyPlaceholder')}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
