'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, BookOpen, PlayCircle, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/core/i18n/routing';
import { cn } from '@/shared/lib/utils';
import { useFocusTrap } from '@/shared/lib/useFocusTrap';
import { searchGlobalAction } from '../actions';
import type { SearchCourseHit, SearchLessonHit, SearchResult } from '../types';

const DEBOUNCE_MS = 180;

interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
}

type Row =
  | { kind: 'course'; hit: SearchCourseHit }
  | { kind: 'lesson'; hit: SearchLessonHit };

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
  const t = useTranslations('search');
  const router = useRouter();
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Flat list of rows for keyboard nav — courses first, then lessons.
  const rows: Row[] = useMemo(
    () =>
      result
        ? [
            ...result.courses.map((hit) => ({ kind: 'course' as const, hit })),
            ...result.lessons.map((hit) => ({ kind: 'lesson' as const, hit })),
          ]
        : [],
    [result],
  );

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResult(null);
      setActiveIdx(0);
    } else {
      // Autofocus after mount animation
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const trimmed = query.trim();
    setResult(null);
    setFailed(false);
    if (trimmed.length < 2) {
      setResult(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await searchGlobalAction(trimmed);
        if (cancelled) return;
        setResult(res);
        setFailed(Boolean(res.error));
        setActiveIdx(0);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, open, retry]);

  const go = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (rows.length === 0 || e.target !== inputRef.current) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % rows.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + rows.length) % rows.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const row = rows[activeIdx];
        if (row) go(row.hit.href);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, rows, activeIdx, go, onClose]);

  // Scroll active row into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `[data-row-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const showEmpty =
    !loading && !failed &&
    query.trim().length >= 2 &&
    result !== null &&
    rows.length === 0;

  let runningIdx = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={trapRef}
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-[10vh] z-[101] w-[92vw] max-w-xl -translate-x-1/2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t('title')}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
              <Search className="w-4 h-4 text-[var(--color-muted-foreground)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('placeholder')}
                aria-label={t('input')}
                className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] transition"
                aria-label={t('close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              ref={listRef}
              className="max-h-[60vh] overflow-y-auto py-2"
            >
              {query.trim().length < 2 && (
                <p className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                  {t('minimum')}
                </p>
              )}

              {loading && query.trim().length >= 2 && rows.length === 0 && (
                <p role="status" className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                  {t('loading')}
                </p>
              )}

              {showEmpty && (
                <p className="px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                  {t('empty', { query: query.trim() })}
                </p>
              )}

              {failed && (
                <div className="px-4 py-4 text-center text-sm">
                  <p role="alert">{t('failed')}</p>
                  <button type="button" className="mt-2 text-[var(--color-primary)] underline" onClick={() => setRetry(v => v + 1)}>{t('retry')}</button>
                </div>
              )}
              {result && result.courses.length > 0 && (
                <div>
                  <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {t('courses')}
                  </div>
                  {result.courses.map((hit) => {
                    const idx = runningIdx++;
                    return (
                      <CourseRow
                        key={hit.id}
                        hit={hit}
                        active={idx === activeIdx}
                        onHover={() => setActiveIdx(idx)}
                        onClick={() => go(hit.href)}
                        idx={idx}
                      />
                    );
                  })}
                </div>
              )}

              {result && result.lessons.length > 0 && (
                <div>
                  <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {t('lessons')}
                  </div>
                  {result.lessons.map((hit) => {
                    const idx = runningIdx++;
                    return (
                      <LessonRow
                        key={hit.id}
                        hit={hit}
                        active={idx === activeIdx}
                        onHover={() => setActiveIdx(idx)}
                        onClick={() => go(hit.href)}
                        idx={idx}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-2 text-[11px] text-[var(--color-muted-foreground)]">
              <div className="flex items-center gap-3">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                <span>{t('navigate')}</span>
                <Kbd>↵</Kbd>
                <span>{t('open')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Kbd>Esc</Kbd>
                <span>{t('closeHint')}</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] justify-center rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-1 py-0.5 font-mono text-[10px] text-[var(--color-foreground)]">
      {children}
    </kbd>
  );
}

interface RowProps<T> {
  hit: T;
  active: boolean;
  idx: number;
  onHover: () => void;
  onClick: () => void;
}

function CourseRow({
  hit,
  active,
  idx,
  onHover,
  onClick,
}: RowProps<SearchCourseHit>) {
  const t = useTranslations('search');
  return (
    <button
      type="button"
      data-row-idx={idx}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2 text-left transition',
        active ? 'bg-[var(--color-muted)]' : 'hover:bg-[var(--color-muted)]/60',
      )}
    >
      <div className="relative w-14 h-9 shrink-0 overflow-hidden rounded-md bg-[var(--color-muted)]">
        {hit.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hit.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
            {hit.title}
          </p>
          {hit.locked && (
            <span aria-label={t('locked')}><Lock className="w-3 h-3 text-[var(--color-muted-foreground)] shrink-0" /></span>
          )}
        </div>
        {hit.subtitle && (
          <p className="truncate text-xs text-[var(--color-muted-foreground)]">
            {hit.subtitle}
          </p>
        )}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] shrink-0">
        {t('course')}
      </span>
    </button>
  );
}

function LessonRow({
  hit,
  active,
  idx,
  onHover,
  onClick,
}: RowProps<SearchLessonHit>) {
  const t = useTranslations('search');
  return (
    <button
      type="button"
      data-row-idx={idx}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2 text-left transition',
        active ? 'bg-[var(--color-muted)]' : 'hover:bg-[var(--color-muted)]/60',
      )}
    >
      <div className="w-14 h-9 shrink-0 flex items-center justify-center rounded-md bg-[var(--color-muted)]">
        <PlayCircle className="w-4 h-4 text-[var(--color-muted-foreground)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
            {hit.title}
          </p>
          {hit.locked && (
            <span aria-label={t('locked')}><Lock className="w-3 h-3 text-[var(--color-muted-foreground)] shrink-0" /></span>
          )}
        </div>
        <p className="truncate text-xs text-[var(--color-muted-foreground)]">
          {hit.courseTitle}
        </p>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] shrink-0">
        {t('lesson')}
      </span>
    </button>
  );
}
