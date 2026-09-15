'use client';

import { useEffect } from 'react';
import { Link } from '@/core/i18n/routing';
import { useFormatter, useTranslations } from 'next-intl';
import {
  Flame,
  Clock,
  CheckCircle2,
  Gauge,
  BookOpen,
} from 'lucide-react';
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from 'motion/react';
import { DURATION, EASE, STAGGER } from '@/shared/motion/constants';
import type { DashboardStats } from '@/features/Dashboard/queries.server';

// Five-card learning stats strip for the Progress page. Replaces the
// previous split (DashboardStats + CourseProgressPage stats grid) with
// a single curated row that mixes "current momentum" (streak, this
// week) with "career so far" (lessons done, overall %) and one
// action-oriented anchor (active course → resume).

const container = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER.default } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE.out },
  },
};

function AnimatedNumber({ value, percent = false }: { value: number; percent?: boolean }) {
  const format = useFormatter();
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const rounded = useTransform(mv, (v) => percent
    ? format.number(Math.round(v) / 100, { style: 'percent', maximumFractionDigits: 0 })
    : format.number(Math.round(v)));

  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 1.1, ease: EASE.out });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced]);

  return <motion.span>{rounded}</motion.span>;
}

function StatCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={item}
      whileHover={{ y: -2 }}
      transition={EASE.spring}
      className="rounded-xl border border-hairline bg-[var(--color-card)]/60 px-4 py-3.5 md:px-5 md:py-4"
    >
      {children}
    </motion.div>
  );
}

interface Props {
  stats: DashboardStats;
  totals: {
    /** Lifetime distinct lessons completed across enrolled courses. */
    lessonsDone: number;
    /** Lifetime aggregate completion (completed / total) across enrolled. */
    overallPercent: number;
  };
}

export function LearningStats({ stats, totals }: Props) {
  const t = useTranslations('learningOverview.stats');
  const overview = useTranslations('learningOverview.dashboard');
  // Hide the whole strip when the user has nothing to brag about yet —
  // the heatmap above is the right surface for "you haven't started",
  // a row of zeros below it would just shout the same message twice.
  const hasAny =
    stats.streakDays > 0 ||
    stats.minutesThisWeek > 0 ||
    totals.lessonsDone > 0 ||
    stats.activeCourse !== null;
  if (!hasAny) return null;

  const streakHelper =
    stats.streakLongest > stats.streakDays
      ? t('longest', { count: stats.streakLongest })
      : stats.streakDays > 0
        ? t('keepGoing')
        : t('startStreak');

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {/* Streak */}
      <StatCard>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
              {t('streak')}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-2xl md:text-3xl font-semibold text-[var(--color-foreground)] leading-none">
                <AnimatedNumber value={stats.streakDays} />
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {t('days', { count: stats.streakDays })}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)] truncate">
              {streakHelper}
            </p>
          </div>
          <Flame
            className={`w-5 h-5 shrink-0 ${
              stats.streakDays > 0
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-muted-foreground)]'
            }`}
          />
        </div>
      </StatCard>

      {/* This week */}
      <StatCard>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
              {t('week')}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-2xl md:text-3xl font-semibold text-[var(--color-foreground)] leading-none">
                <AnimatedNumber value={stats.minutesThisWeek} />
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {t('minutes')}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)] truncate">
              {t('weekLessons', { count: stats.lessonsThisWeek })}
            </p>
          </div>
          <Clock className="w-5 h-5 shrink-0 text-[var(--color-muted-foreground)]" />
        </div>
      </StatCard>

      {/* Lessons done — lifetime total */}
      <StatCard>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
              {t('lessonsDone')}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-2xl md:text-3xl font-semibold text-[var(--color-foreground)] leading-none">
                <AnimatedNumber value={totals.lessonsDone} />
              </span>
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {t('total')}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)] truncate">
              {t('allTime')}
            </p>
          </div>
          <CheckCircle2 className="w-5 h-5 shrink-0 text-[var(--color-muted-foreground)]" />
        </div>
      </StatCard>

      {/* Overall % — career completion */}
      <StatCard>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
              {t('overall')}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-2xl md:text-3xl font-semibold text-[var(--color-foreground)] leading-none">
                <AnimatedNumber value={totals.overallPercent} percent />
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)] truncate">
              {t('acrossEnrolled')}
            </p>
          </div>
          <Gauge className="w-5 h-5 shrink-0 text-[var(--color-muted-foreground)]" />
        </div>
      </StatCard>

      {/* Active course — full card, larger surface, click-through */}
      <StatCard>
        {stats.activeCourse ? (
          <Link
            href={`/courses/${stats.activeCourse.slug}`}
            className="group block"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
                  {t('activeCourse')}
                </p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-display text-2xl md:text-3xl font-semibold text-[var(--color-foreground)] leading-none">
                    <AnimatedNumber value={stats.activeCourse.percent} percent />
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)] truncate group-hover:text-[var(--color-foreground)] transition-colors">
                  {stats.activeCourse.title}
                </p>
              </div>
              <BookOpen className="w-5 h-5 shrink-0 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] transition-colors" />
            </div>
            <div className="mt-3 h-1 rounded-full bg-[var(--color-border)] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-[var(--color-primary)]"
                initial={{ width: 0 }}
                animate={{ width: `${stats.activeCourse.percent}%` }}
                transition={{ duration: DURATION.slower, ease: EASE.out }}
              />
            </div>
          </Link>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
                {t('activeCourse')}
              </p>
              <p className="mt-1 font-display text-lg md:text-xl text-[var(--color-foreground)]">
                {t('pickCourse')}
              </p>
              <Link
                href="/courses"
                className="mt-1 inline-block text-xs text-[var(--color-primary)] hover:underline"
              >
                {overview('browse')}
              </Link>
            </div>
            <BookOpen className="w-5 h-5 shrink-0 text-[var(--color-muted-foreground)]" />
          </div>
        )}
      </StatCard>
    </motion.div>
  );
}
