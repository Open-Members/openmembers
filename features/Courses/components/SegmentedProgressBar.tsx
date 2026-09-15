'use client';

import { motion } from 'motion/react';
import { useFormatter, useTranslations } from 'next-intl';
import { DURATION, EASE } from '@/shared/motion/constants';
import type { CourseDetailView } from '@/features/Courses/queries.server';

type Module = CourseDetailView['modules'][number];

interface Props {
  modules: Module[];
  totalLessons: number;
  completedLessons: number;
}

/**
 * Module-segmented progress bar for the course-detail hero. Replaces
 * the old flat bar so students can see WHERE in the course they are,
 * not just how much overall. Each segment is a module, sized
 * proportionally to its lesson count; the inner fill mirrors per-module
 * completion. Hover any segment to see its label + ratio via the
 * native title tooltip.
 *
 * Animation: each segment's fill flies from 0 → target on mount with a
 * small per-segment stagger (cubic out, ~600 ms tail-to-head). Honour
 * prefers-reduced-motion automatically via the global MotionProvider.
 */
export function SegmentedProgressBar({
  modules,
  totalLessons,
  completedLessons,
}: Props) {
  const t = useTranslations('learning.progress');
  const format = useFormatter();
  const overallPercent =
    totalLessons > 0
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

  return (
    <div className="mt-5 max-w-xl">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--color-muted-foreground)]">
          {t('title')}
        </span>
        <span className="text-xs font-bold text-[var(--color-primary)] tabular-nums">
          {format.number(overallPercent / 100, { style: 'percent' })}
        </span>
      </div>

      {/* Segmented track. Outer rounding clips the edge segments;
          1px gaps give the segmented "by module" read without making
          the bar feel busy. */}
      <div
        className="flex h-2 gap-px rounded-full bg-[var(--color-muted)] overflow-hidden"
        role="progressbar"
        aria-valuenow={overallPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('label', { completed: completedLessons, total: totalLessons })}
      >
        {modules.map((m, i) => {
          const moduleTotal = m.lessons.length;
          if (moduleTotal === 0) return null;
          const moduleCompleted = m.lessons.filter((l) => l.isCompleted).length;
          const widthPercent = (moduleTotal / totalLessons) * 100;
          const fillPercent =
            moduleTotal > 0 ? (moduleCompleted / moduleTotal) * 100 : 0;

          return (
            <div
              key={m.id}
              title={t('module', { title: m.title, completed: moduleCompleted, total: moduleTotal })}
              className="relative h-full bg-[var(--color-muted)]"
              style={{ width: `${widthPercent}%` }}
            >
              <motion.div
                className="absolute inset-y-0 left-0 bg-[var(--color-primary)]"
                initial={{ width: 0 }}
                animate={{ width: `${fillPercent}%` }}
                transition={{
                  duration: DURATION.slow,
                  ease: EASE.out,
                  delay: 0.1 + i * 0.04,
                }}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
        {t('completed', { completed: completedLessons, total: totalLessons })}
      </p>
    </div>
  );
}
