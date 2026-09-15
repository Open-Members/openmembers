'use client';

import { useTransition, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { setLessonCompleted } from '@/features/Progress/actions';
import { useConfetti } from '@/shared/motion/useConfetti';
import { appToast } from '@/shared/lib/toast';
import { EASE } from '@/shared/motion/constants';

interface MarkCompleteButtonProps {
  lessonId: string;
  isCompleted: boolean;
}

/**
 * The single biggest action on the lesson player. Two states:
 *
 *  - Not yet completed → primary-coloured CTA, prominent.
 *  - Completed → muted "Completed" pill, still clickable to undo.
 *
 * Transitioning false → true fires:
 *   - canvas-confetti burst from the button's screen position so the
 *     animation feels "anchored" to the action.
 *   - Heroui success toast.
 *   - The icon morphs in via AnimatePresence with a spring pop.
 *   - The button itself ticks down (whileTap) on click for tactile feel.
 *
 * Reverse direction (true → false) does NOT celebrate — it's an undo,
 * not a win.
 *
 * Reduced-motion users: confetti is skipped (no-op via useConfetti),
 * the button morph still happens (cheap), and the toast still shows.
 */
export function MarkCompleteButton({
  lessonId,
  isCompleted,
}: MarkCompleteButtonProps) {
  const t = useTranslations('learning.completion');
  const errors = useTranslations('learning.errors');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const fireConfetti = useConfetti();

  const handleClick = () => {
    const willComplete = !isCompleted;
    startTransition(async () => {
      let result;
      try {
        result = await setLessonCompleted(lessonId, willComplete);
      } catch {
        appToast.danger(errors('saveProgress'));
        return;
      }
      if ('error' in result) {
        appToast.danger(errors('saveProgress'));
        return;
      }

      // Celebrate only on the false → true edge. Reverse direction is
      // an undo, not an achievement.
      if (willComplete) {
        const rect = buttonRef.current?.getBoundingClientRect();
        const origin = rect
          ? {
              x: (rect.left + rect.width / 2) / window.innerWidth,
              // Slightly above the button so particles read as
              // "leaping out" of the click point.
              y: (rect.top + rect.height / 2) / window.innerHeight - 0.05,
            }
          : { x: 0.5, y: 0.6 };

        if (result.courseJustCompleted) {
          // Whole-course finish — three staggered bursts, much louder
          // than a single-lesson celebration. Toast also takes on a
          // different shape so muscle memory says "this is bigger".
          fireConfetti({ origin, particleCount: 140 });
          setTimeout(
            () => fireConfetti({ origin: { x: 0.2, y: 0.7 }, particleCount: 90 }),
            220,
          );
          setTimeout(
            () => fireConfetti({ origin: { x: 0.8, y: 0.7 }, particleCount: 90 }),
            440,
          );
          appToast.success(
            t('courseTitle'),
            t('courseMessage'),
          );
        } else {
          fireConfetti({ origin });
          appToast.success(t('lessonTitle'), t('lessonMessage'));
        }
      }

      router.refresh();
    });
  };

  const baseClasses =
    'relative flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50';
  const stateClasses = isCompleted
    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50'
    : 'bg-[var(--color-primary)] text-white hover:opacity-90';

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={isCompleted}
      whileTap={{ scale: 0.96 }}
      transition={EASE.springSnappy}
      className={`${baseClasses} ${stateClasses}`}
      title={
        isCompleted ? t('undoHint') : t('completeHint')
      }
    >
      {/* Icon swap with spring pop. Pending state takes precedence so
          users see they're waiting for the server. */}
      <span className="inline-flex w-5 h-5">
        <AnimatePresence mode="wait" initial={false}>
          {isPending ? (
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
              key="done"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={EASE.springSnappy}
              className="inline-flex"
            >
              <CheckCircle2 className="w-5 h-5" />
            </motion.span>
          ) : (
            <motion.span
              key="idle"
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
      </span>

      {/* Label morphs too — same AnimatePresence trick keeps the swap
          synchronised with the icon. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isCompleted ? 'label-done' : 'label-idle'}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {isCompleted ? t('completed') : t('mark')}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
