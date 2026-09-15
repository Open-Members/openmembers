import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/core/supabase/server';
import { fetchEnrolledCoursesServer } from '@/features/Courses/queries.server';
import { CourseProgressPage } from '@/features/Progress/components/CourseProgressPage';
import { ActivityHeatmap } from '@/features/Progress/components/ActivityHeatmap';
import { LearningStats } from '@/features/Progress/components/LearningStats';
import { UpcomingLiveStrip } from '@/features/LiveClasses/components/UpcomingLiveStrip';
import { listLiveClassesForUser } from '@/features/LiveClasses/queries.server';
import { getDashboardStats, getUserActivityByDay } from '@/features/Dashboard/queries.server';

export default async function ProgressPage() {
  const t = await getTranslations('learningOverview.progress');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Pull a wide calendar window so the client can page between months
  // without re-fetching: 1 month back, 12 months forward from today.
  const now = new Date();
  const fromIso = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const toIso = new Date(
    now.getFullYear(),
    now.getMonth() + 13,
    0,
    23,
    59,
    59,
  ).toISOString();

  const [courses, liveClasses, stats, activity] = await Promise.all([
    fetchEnrolledCoursesServer(user.id),
    listLiveClassesForUser(user.id, { fromIso, toIso }),
    getDashboardStats(user.id),
    getUserActivityByDay(user.id),
  ]);

  // Lifetime aggregate from enrolled courses — feeds LearningStats so the
  // strip doesn't need its own DB round-trip and stays a pure view.
  const lessonsDone = courses.reduce((s, c) => s + c.completedLessons, 0);
  const lessonsTotal = courses.reduce((s, c) => s + c.totalLessons, 0);
  const overallPercent =
    lessonsTotal > 0 ? Math.round((lessonsDone / lessonsTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-10 md:gap-14 px-4 md:px-8 lg:px-12 py-8 md:py-12 pb-20">
      {/* Page header — matches Dashboard editorial treatment */}
      <header className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-muted-foreground)]">
          {t('eyebrow')}
        </p>
        <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-medium leading-tight tracking-tight text-[var(--color-foreground)]">
          {t('title')}
        </h1>
        <p className="text-sm md:text-base text-[var(--color-muted-foreground)] max-w-xl">
          {t('description')}
        </p>
      </header>

      {/* Activity heatmap — last 12 weeks, GitHub-style. Always rendered
          (even with zero activity) so it sits as a constant motivational
          surface; an empty grid is the visual prompt to get started. */}
      <ActivityHeatmap days={activity} />

      {/* Unified stats strip — momentum (streak, this week) +
          career-total (lessons, overall %) + active course in one row.
          Replaces the old split (DashboardStats up here +
          CourseProgressPage's 4-card strip below) so we have one
          surface to scan, not two. Hides itself for zero-activity
          users. */}
      <LearningStats
        stats={stats}
        totals={{ lessonsDone, overallPercent }}
      />

      {/* Compact upcoming-live list — next 30 days, max 5 entries.
          Replaces the legacy month-grid calendar (kept in
          features/LiveClasses/components/LiveClassesCalendar.tsx for
          future re-use) which ate 80% of the viewport when empty. */}
      <UpcomingLiveStrip
        events={liveClasses}
        hasAnyEnrollment={courses.length > 0}
      />

      {/* Skip the progress block for users with zero enrollments — the
          calendar's own banner already handles the "enroll" CTA, so avoid
          doubling up on the same message. */}
      {courses.length > 0 && <CourseProgressPage courses={courses} />}
    </div>
  );
}
