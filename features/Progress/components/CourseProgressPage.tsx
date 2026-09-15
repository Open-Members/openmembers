'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/core/i18n/routing';
import {
  BookOpen,
  CheckCircle2,
  ArrowRight,
  Compass,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { CourseWithProgress } from '@/features/Courses/types';

interface CourseProgressPageProps {
  courses: CourseWithProgress[];
}

export function CourseProgressPage({ courses }: CourseProgressPageProps) {
  const t = useTranslations('learningOverview.progress');
  const inProgress = courses.filter(
    (c) => c.progressPercent > 0 && c.progressPercent < 100,
  );
  const completed = courses.filter((c) => c.progressPercent === 100);

  if (courses.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      {/* Stats moved up to LearningStats on the page level — keep this
          component focused on per-course breakdowns. */}

      {/* In progress */}
      {inProgress.length > 0 && (
        <Section
          eyebrow={t('inProgress.eyebrow')}
          heading={t('inProgress.title')}
          subtitle={t('inProgress.description', { count: inProgress.length })}
        >
          <CourseList courses={inProgress} />
        </Section>
      )}

      {/* Not started yet */}
      {(() => {
        const notStarted = courses.filter((c) => c.progressPercent === 0);
        if (notStarted.length === 0) return null;
        return (
          <Section
            eyebrow={t('notStarted.eyebrow')}
            heading={t('notStarted.title')}
            subtitle={t('notStarted.description', { count: notStarted.length })}
          >
            <CourseList courses={notStarted} />
          </Section>
        );
      })()}

      {/* Completed */}
      {completed.length > 0 && (
        <Section
          eyebrow={t('completed.eyebrow')}
          heading={t('completed.title')}
          subtitle={t('completed.description', { count: completed.length })}
        >
          <CourseList courses={completed} variant="completed" />
        </Section>
      )}
    </div>
  );
}

// ─── Section shell ──────────────────────────────────────────────────────────

function Section({
  eyebrow,
  heading,
  subtitle,
  children,
}: {
  eyebrow: string;
  heading: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)]">
          {eyebrow}
        </p>
        <h2 className="font-display text-2xl md:text-3xl font-medium leading-tight tracking-tight text-[var(--color-foreground)]">
          {heading}
        </h2>
        {subtitle && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {subtitle}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

// ─── Course list ────────────────────────────────────────────────────────────

function CourseList({
  courses,
  variant = 'default',
}: {
  courses: CourseWithProgress[];
  variant?: 'default' | 'completed';
}) {
  return (
    <div className="flex flex-col gap-3">
      {courses.map((course, index) => (
        <CourseRow
          key={course.id}
          course={course}
          index={index}
          completed={variant === 'completed'}
        />
      ))}
    </div>
  );
}

function CourseRow({
  course,
  index,
  completed,
}: {
  course: CourseWithProgress;
  index: number;
  completed: boolean;
}) {
  const t = useTranslations('learningOverview.progress.course');
  const format = useFormatter();
  // Completed rows → course overview (so the student can review).
  // In-progress / up-next rows → jump straight into the resume lesson when
  // we have one. Fall back to the overview if the course has no lessons.
  const href =
    completed || !course.resumeLessonSlug
      ? `/courses/${course.slug}`
      : `/courses/${course.slug}/${course.resumeLessonSlug}`;

  const cta: string | null = completed
    ? null
    : course.progressPercent > 0
      ? t('continue')
      : t('start');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.2), duration: 0.3 }}
    >
      <Link
        href={href}
        className="group flex items-center gap-3 md:gap-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 md:p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-lg"
      >
        {/* Thumbnail — compact landscape, fixed size so info always has room */}
        <div className="relative h-16 w-28 md:h-20 md:w-36 rounded-xl overflow-hidden shrink-0 bg-[var(--color-muted)]">
          {course.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.thumbnailUrl}
              alt={course.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)]">
              <BookOpen className="h-6 w-6 text-white/70" />
            </div>
          )}
          {completed && (
            <div className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--color-accent-foreground)]">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {t('done')}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <h3 className="font-display text-base md:text-lg font-medium leading-snug tracking-tight text-[var(--color-foreground)] line-clamp-1">
              {course.title}
            </h3>
            <p className="text-xs text-[var(--color-muted-foreground)] flex items-center gap-2">
              <span>
                {t('lessons', { completed: course.completedLessons, total: course.totalLessons })}
                {completed ? ` · ${t('allDone')}` : ''}
              </span>
              {cta && (
                <span className="font-bold text-[var(--color-primary)] transition-transform group-hover:translate-x-0.5">
                  {cta}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-muted)] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${course.progressPercent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                className={`h-full rounded-full ${
                  completed
                    ? 'bg-[var(--color-accent)]'
                    : 'bg-[var(--color-primary)]'
                }`}
              />
            </div>
            <span
              className={`text-xs md:text-sm font-bold shrink-0 tabular-nums ${
                completed
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-primary)]'
              }`}
            >
              {format.number(course.progressPercent / 100, { style: 'percent', maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <ArrowRight className="hidden md:block h-5 w-5 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--color-primary)]" />
      </Link>
    </motion.div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState() {
  const t = useTranslations('learningOverview');
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-16 md:py-20 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] mb-5">
        <Compass className="w-6 h-6" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)] mb-2">
        {t('progress.empty.eyebrow')}
      </p>
      <h2 className="font-display text-2xl md:text-3xl font-medium text-[var(--color-foreground)] leading-tight tracking-tight mb-3">
        {t('progress.empty.title')}
      </h2>
      <p className="text-sm md:text-base text-[var(--color-muted-foreground)] max-w-md mx-auto mb-6 leading-relaxed">
        {t('progress.empty.description')}
      </p>
      <Link
        href="/courses"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <Compass className="w-4 h-4" />
        {t('dashboard.browse')}
      </Link>
    </section>
  );
}
