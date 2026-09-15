'use client';

import { useTransition } from 'react';
import { Link } from '@/core/i18n/routing';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Check, CheckCircle2, Circle, Clock, Loader2, Lock, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EASE } from '@/shared/motion/constants';

type Props = {
  index: number;
  title: string;
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  href?: string | null;
  /** Lesson already finished by the user. */
  isCompleted?: boolean;
  /** Lesson the user is currently on (for player sidebar). */
  isCurrent?: boolean;
  /** Drip-gated — shows unlock date. */
  isDripLocked?: boolean;
  dripUnlockDate?: string | null;
  /** Whole course is locked (user not enrolled). */
  isCourseLocked?: boolean;
  /** Free-preview lesson on a locked course — clickable even if course locked. */
  isFreePreview?: boolean;
  /**
   * Inline toggle to mark/unmark the lesson as watched. Omit to hide the
   * control entirely (e.g. for locked previews or read-only lists).
   * Receives the desired next value so callers don't have to mirror state.
   */
  onToggleComplete?: (next: boolean) => void | Promise<void>;
};

export function EpisodeListItem(props: Props) {
  const t = useTranslations('learningOverview.episode');
  const duration = useTranslations('learningOverview.duration');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  function formatDuration(seconds: number | null | undefined): string | null {
    if (!seconds || seconds <= 0) return null;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    if (minutes === 0) return duration('seconds', { seconds: remaining });
    if (remaining === 0) return duration('minutes', { minutes });
    return duration('minutesSeconds', { minutes, seconds: remaining });
  }

  function formatUnlockDate(iso: string | null | undefined): string {
    if (!iso) return t('locked');
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return t('locked');
    if (date <= now) return t('unlocked');
    const days = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 14) return t('unlockDays', { count: days });
    return t('unlockDate', { date: format.dateTime(date, { dateStyle: 'long' }) });
  }
  const {
    index,
    title,
    durationSeconds,
    thumbnailUrl,
    href,
    isCompleted = false,
    isCurrent = false,
    isDripLocked = false,
    dripUnlockDate = null,
    isCourseLocked = false,
    isFreePreview = false,
    onToggleComplete,
  } = props;

  const hardLocked = isDripLocked || (isCourseLocked && !isFreePreview);
  const clickable = Boolean(href) && !hardLocked;
  const durationLabel = formatDuration(durationSeconds);
  const showToggle = Boolean(onToggleComplete) && !hardLocked;

  const [isTogglePending, startToggleTransition] = useTransition();

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onToggleComplete) return;
    startToggleTransition(async () => {
      await onToggleComplete(!isCompleted);
    });
  };

  const content = (
    <div
      className={`flex items-center gap-3 md:gap-4 rounded-xl p-3 transition ${
        isCurrent
          ? 'bg-[var(--color-primary)]/10 ring-1 ring-inset ring-[var(--color-primary)]/40'
          : clickable
            ? 'hover:bg-[var(--color-muted)]'
            : ''
      } ${hardLocked ? 'opacity-60' : ''}`}
    >
      {/* Index + thumbnail */}
      <div className="relative w-20 h-12 md:w-24 md:h-14 rounded-lg overflow-hidden bg-[var(--color-muted)] flex-shrink-0">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt=""
            fill
            sizes="96px"
            className={`object-cover ${hardLocked ? 'grayscale brightness-[0.6]' : ''}`}
            unoptimized
          />
        ) : (
          <div
            className={`absolute inset-0 flex items-center justify-center text-white/70 font-black text-sm ${
              hardLocked ? 'opacity-60' : ''
            }`}
            style={{
              background:
                'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
            }}
          >
            {format.number(index, { minimumIntegerDigits: 2, useGrouping: false })}
          </div>
        )}

        {/* Status overlay icon */}
        {isCompleted && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
        )}
        {isCurrent && !isCompleted && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Play className="w-5 h-5 text-white fill-current" />
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {t('number', { number: format.number(index, { minimumIntegerDigits: 2, useGrouping: false }) })}
          </span>
          {isCompleted && (
            <span className="text-[10px] md:text-xs font-semibold text-green-600 dark:text-green-400">
              · {t('completed')}
            </span>
          )}
          {isCurrent && !isCompleted && (
            <span
              className="text-[10px] md:text-xs font-semibold"
              style={{ color: 'var(--color-primary)' }}
            >
              · {t('watching')}
            </span>
          )}
          {isFreePreview && isCourseLocked && (
            <span
              className="text-[10px] md:text-xs font-semibold"
              style={{ color: 'var(--color-accent)' }}
            >
              · {t('preview')}
            </span>
          )}
        </div>
        <h3 className="text-sm md:text-base font-semibold text-[var(--color-foreground)] truncate">
          {title}
        </h3>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--color-muted-foreground)]">
          {durationLabel && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {durationLabel}
            </span>
          )}
          {isDripLocked && (
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {formatUnlockDate(dripUnlockDate)}
            </span>
          )}
          {isCourseLocked && !isFreePreview && !isDripLocked && (
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {t('locked')}
            </span>
          )}
        </div>
      </div>

      {showToggle && (
        <button
          type="button"
          onClick={handleToggle}
          disabled={isTogglePending}
          aria-pressed={isCompleted}
          aria-label={isCompleted ? t('markUnwatched') : t('markWatched')}
          title={isCompleted ? t('markUnwatched') : t('markWatched')}
          className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition disabled:opacity-50 ${
            isCompleted
              ? 'text-green-600 hover:bg-green-500/10 dark:text-green-400'
              : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]'
          }`}
        >
          {/* Icon swap with a spring pop so flipping completion state
              feels confirmed. initial={false} prevents the spring from
              firing on first render — only on transitions. */}
          <AnimatePresence mode="wait" initial={false}>
            {isTogglePending ? (
              <motion.span
                key="pending"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                className="inline-flex"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
              </motion.span>
            ) : isCompleted ? (
              <motion.span
                key="completed"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={EASE.springSnappy}
                className="inline-flex"
              >
                <CheckCircle2 className="w-5 h-5" />
              </motion.span>
            ) : (
              <motion.span
                key="open"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={EASE.spring}
                className="inline-flex"
              >
                <Circle className="w-5 h-5" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      )}
    </div>
  );

  if (clickable && href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return <div>{content}</div>;
}
