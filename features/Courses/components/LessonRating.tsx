'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star, Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useFormatter, useTranslations } from 'next-intl';

type Aggregate = {
  avg: number | null;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
};

type MyRating = { stars: number; comment: string | null } | null;

type Props = { lessonId: string };
type RatingError = 'loadFailed' | 'saveFailed' | 'removeFailed' | 'notAuthenticated' | 'accessDenied';

function responseError(status: number, fallback: RatingError): RatingError {
  if (status === 401) return 'notAuthenticated';
  if (status === 403) return 'accessDenied';
  return fallback;
}

export function LessonRating({ lessonId }: Props) {
  const t = useTranslations('learning.rating');
  const format = useFormatter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<RatingError | null>(null);

  const [myRating, setMyRating] = useState<MyRating>(null);
  const [aggregate, setAggregate] = useState<Aggregate | null>(null);

  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lessons/${lessonId}/rating`, { cache: 'no-store' })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setError(responseError(r.status, 'loadFailed'));
          return;
        }
        const json = await r.json();
        if (cancelled) return;
        setMyRating(json.myRating);
        setAggregate(json.aggregate);
        if (json.myRating) setStars(json.myRating.stars);
      })
      .catch(() => {
        if (!cancelled) setError('loadFailed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const save = useCallback(
    async (n: number) => {
      setStars(n);
      setSaving(true);
      setError(null);
      try {
        const r = await fetch(`/api/lessons/${lessonId}/rating`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ stars: n, comment: null }),
        });
        if (!r.ok) {
          setError(responseError(r.status, 'saveFailed'));
          setStars(myRating?.stars ?? 0);
          return;
        }
        const json = await r.json();
        setMyRating(json.myRating);
        setAggregate(json.aggregate);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      } catch {
        setError('saveFailed');
        setStars(myRating?.stars ?? 0);
      } finally {
        setSaving(false);
      }
    },
    [lessonId, myRating],
  );

  const remove = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/lessons/${lessonId}/rating`, { method: 'DELETE' });
      if (!r.ok) {
        setError(responseError(r.status, 'removeFailed'));
        return;
      }
      const json = await r.json();
      setMyRating(null);
      setAggregate(json.aggregate);
      setStars(0);
    } catch {
      setError('removeFailed');
    } finally {
      setSaving(false);
    }
  }, [lessonId]);

  const active = hover || stars;
  const hasRated = Boolean(myRating);
  const avgText =
    aggregate && aggregate.count > 0 && aggregate.avg !== null
      ? format.number(aggregate.avg, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : null;

  return (
    <section
      id="lesson-rating"
      aria-labelledby="lesson-rating-title"
      className="scroll-mt-24"
    >
      <header className="flex items-center gap-2 mb-3">
        <Star className="w-5 h-5 text-[var(--color-primary)]" />
        <h2
          id="lesson-rating-title"
          className="text-lg md:text-xl font-bold text-[var(--color-foreground)]"
        >
          {t('title')}
        </h2>
      </header>

      <div
        className={cn(
          'flex flex-wrap items-center gap-x-5 gap-y-2 max-w-3xl transition-opacity',
          loading && 'opacity-0',
        )}
      >
        <div
          className="flex items-center gap-0.5"
          onMouseLeave={() => setHover(0)}
          role="radiogroup"
          aria-label={t('label')}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= active;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={t('stars', { count: n })}
                disabled={saving}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(0)}
                onClick={() => save(n)}
                className="p-1 rounded transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40"
              >
                <Star
                  strokeWidth={1.5}
                  className={cn(
                    'w-5 h-5 transition-colors',
                    filled
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-[var(--color-muted-foreground)]/35',
                  )}
                />
              </button>
            );
          })}
        </div>

        {avgText && aggregate && (
          <div className="text-xs text-[var(--color-muted-foreground)]">
            <span className="font-semibold text-[var(--color-foreground)]">{avgText}</span>
            <span>
              {' · '}
              {t('count', { count: aggregate.count })}
            </span>
          </div>
        )}

        {savedFlash && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" />
            {t('saved')}
          </span>
        )}

        {hasRated && !savedFlash && (
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] underline underline-offset-4 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('remove')}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{t(error)}</p>
      )}
    </section>
  );
}
