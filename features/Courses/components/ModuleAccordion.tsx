'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { appToast } from '@/shared/lib/toast';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { EpisodeListItem } from '@/shared/components/student/EpisodeListItem';
import { setLessonCompleted } from '@/features/Progress/actions';
import { DURATION, EASE, STAGGER } from '@/shared/motion/constants';
import type { CourseDetailView } from '@/features/Courses/queries.server';

const lessonsContainer = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER.tight } },
};

const lessonItem = {
  hidden: { opacity: 0, x: -8 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.short, ease: EASE.out },
  },
};

type Module = CourseDetailView['modules'][number];

type Props = {
  modules: Module[];
  courseSlug: string;
  courseAccessible: boolean;
  thumbnailUrl: string | null;
};

export function ModuleAccordion({
  modules,
  courseSlug,
  courseAccessible,
  thumbnailUrl,
}: Props) {
  const router = useRouter();
  const t = useTranslations('learning.modules');
  const errors = useTranslations('learning.errors');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const allOpen = openIds.size === modules.length && modules.length > 0;

  const totals = useMemo(() => {
    let lessons = 0;
    let seconds = 0;
    for (const m of modules) {
      lessons += m.lessons.length;
      for (const l of m.lessons) seconds += l.durationSeconds ?? 0;
    }
    return { lessons, seconds };
  }, [modules]);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allOpen) setOpenIds(new Set());
    else setOpenIds(new Set(modules.map((m) => m.id)));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs md:text-sm text-[var(--color-muted-foreground)]">
          {t('summary', { modules: modules.length, lessons: totals.lessons })}
          {totals.seconds > 0 && <> · {formatTotalDuration(totals.seconds, t)}</>}
        </p>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs md:text-sm font-semibold text-[var(--color-primary)] hover:underline"
        >
          {allOpen ? t('collapse') : t('expand')}
        </button>
      </div>

      {/* Modules */}
      <div className="flex flex-col gap-3">
        {modules.map((m, mIdx) => {
          const isOpen = openIds.has(m.id);
          const completed = m.lessons.filter((l) => l.isCompleted).length;
          const moduleSeconds = m.lessons.reduce(
            (acc, l) => acc + (l.durationSeconds ?? 0),
            0,
          );

          return (
            <div
              key={m.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(m.id)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-4 p-4 md:p-5 text-left transition hover:bg-[var(--color-muted)]/50"
              >
                {/* Number */}
                <span className="hidden sm:flex shrink-0 font-display text-2xl md:text-3xl font-medium text-[var(--color-muted-foreground)] tabular-nums min-w-[2.5rem]">
                  {String(mIdx + 1).padStart(2, '0')}
                </span>

                {/* Title + meta */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="sm:hidden text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)]">
                      {t('number', { number: String(mIdx + 1).padStart(2, '0') })}
                    </span>
                    <h3 className="font-display text-lg md:text-xl font-medium text-[var(--color-foreground)] leading-tight tracking-tight truncate">
                      {m.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs md:text-sm text-[var(--color-muted-foreground)] flex-wrap">
                    <span>
                      {t('lessons', { count: m.lessons.length })}
                    </span>
                    {moduleSeconds > 0 && (
                      <>
                        <span className="opacity-50">·</span>
                        <span>{formatTotalDuration(moduleSeconds, t)}</span>
                      </>
                    )}
                    {courseAccessible && completed > 0 && (
                      <>
                        <span className="opacity-50">·</span>
                        <span className="font-semibold text-[var(--color-primary)]">
                          {t('completed', { completed, total: m.lessons.length })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Chevron */}
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 text-[var(--color-muted-foreground)]"
                >
                  <ChevronDown className="w-5 h-5" />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 md:px-4 pb-4 pt-1 border-t border-[var(--color-border)]">
                      {m.description && (
                        <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed px-1 py-3 max-w-2xl">
                          {m.description}
                        </p>
                      )}
                      {/* Stagger the lessons in when the module
                          accordion opens so a long list doesn't slam
                          into view. tight stagger keeps it under 500ms
                          even for 25-lesson modules. */}
                      <motion.div
                        className="flex flex-col gap-1.5"
                        variants={lessonsContainer}
                        initial="hidden"
                        animate="show"
                      >
                        {m.lessons.map((l, lIdx) => (
                          <motion.div key={l.id} variants={lessonItem}>
                            <EpisodeListItem
                              index={lIdx + 1}
                              title={l.title}
                              durationSeconds={l.durationSeconds}
                              thumbnailUrl={thumbnailUrl}
                              href={
                                lessonClickable(courseAccessible, l)
                                  ? `/courses/${courseSlug}/${l.slug}`
                                  : null
                              }
                              isCompleted={l.isCompleted}
                              isDripLocked={l.isDripLocked}
                              dripUnlockDate={l.dripUnlockDate}
                              isCourseLocked={!courseAccessible}
                              isFreePreview={l.isFreePreview}
                              onToggleComplete={
                                courseAccessible
                                  ? async (next) => {
                                      try {
                                        const result = await setLessonCompleted(l.id, next);
                                        if ('error' in result) {
                                          appToast.danger(errors('saveProgress'));
                                          return;
                                        }
                                        router.refresh();
                                      } catch {
                                        appToast.danger(errors('saveProgress'));
                                      }
                                    }
                                  : undefined
                              }
                            />
                          </motion.div>
                        ))}
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTotalDuration(seconds: number, t: ReturnType<typeof useTranslations<'learning.modules'>>): string {
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return t('minutes', { minutes: m });
  if (m === 0) return t('hours', { hours: h });
  return t('hoursMinutes', { hours: h, minutes: m });
}

function lessonClickable(
  courseAccessible: boolean,
  lesson: { isDripLocked: boolean; isFreePreview: boolean },
): boolean {
  if (lesson.isDripLocked) return false;
  if (courseAccessible) return true;
  return lesson.isFreePreview;
}
