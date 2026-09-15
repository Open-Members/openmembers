import { createAdminClient } from '@/core/supabase/admin';
import { getUserCourseAccess, getUserOwnedCourses } from '@/core/access/server';
import { isR2Configured } from '@/lib/services/r2/client';
import { presignPlayback } from '@/lib/services/r2/presign';
import type { CardCourse } from '@/shared/components/student/CourseCard';

async function presignTrailers(
  keys: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!isR2Configured()) return map;
  const unique = [...new Set(keys.filter((k): k is string => !!k))];
  if (unique.length === 0) return map;
  const results = await Promise.allSettled(unique.map((k) => presignPlayback(k)));
  for (let i = 0; i < unique.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') map.set(unique[i], r.value);
    else console.error(`[trailer] presign failed for ${unique[i]}:`, r.reason);
  }
  return map;
}

/**
 * Shape the dashboard consumes: `CardCourse[]` per row, plus a list of
 * in-progress lessons for the "Continue watching" row.
 */
export type DashboardContinueItem = {
  courseSlug: string;
  lessonSlug: string;
  courseTitle: string;
  lessonTitle: string;
  thumbnailUrl: string | null;
  progressPercent: number;
  updatedAt: string;
};

export type DashboardData = {
  enrolled: CardCourse[];
  featured: CardCourse[];
  newReleases: CardCourse[];
  continueWatching: DashboardContinueItem[];
};

type CourseRow = {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  thumbnail_url: string | null;
  thumbnail_landscape_url: string | null;
  thumbnail_portrait_url: string | null;
  duration_minutes: number | null;
  is_new: boolean;
  is_featured: boolean;
  is_free: boolean;
  is_coming_soon: boolean;
  checkout_url: string | null;
  trailer_r2_key: string | null;
  instructors: { name: string; portrait_url: string | null } | null;
};

type CourseProgressMap = Map<string, { total: number; completed: number }>;

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const supabase = createAdminClient();

  // All published courses in one query — the dashboard rows filter in memory.
  const { data: coursesRaw } = await supabase
    .from('courses')
    .select(`
      id, slug, title, short_description, thumbnail_url,
      thumbnail_landscape_url, thumbnail_portrait_url,
      duration_minutes, is_new, is_featured, is_free, is_coming_soon, checkout_url,
      trailer_r2_key,
      instructors ( name, portrait_url )
    `)
    .eq('is_published', true)
    .order('sort_order');

  const courses = (coursesRaw ?? []) as unknown as CourseRow[];

  // Accessibility set and progress map in parallel.
  const [accessSet, ownedSet, progressMap, trailerMap] = await Promise.all([
    getUserCourseAccess(userId),
    getUserOwnedCourses(userId),
    getCourseProgressMap(userId, courses.map((c) => c.id)),
    presignTrailers(courses.map((c) => c.trailer_r2_key)),
  ]);

  const toCard = (c: CourseRow): CardCourse => {
    const prog = progressMap.get(c.id) ?? { total: 0, completed: 0 };
    const percent =
      prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
    const isComingSoon = c.is_coming_soon;
    const isAccessible = !isComingSoon && accessSet.has(c.id);
    const isOwned = !isComingSoon && ownedSet.has(c.id);
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      shortDescription: c.short_description,
      thumbnailLandscapeUrl: c.thumbnail_landscape_url ?? c.thumbnail_url,
      thumbnailPortraitUrl: c.thumbnail_portrait_url,
      instructorName: c.instructors?.name ?? null,
      instructorPortraitUrl: c.instructors?.portrait_url ?? null,
      durationMinutes: c.duration_minutes,
      isNew: c.is_new,
      isFeatured: c.is_featured,
      isFree: c.is_free,
      isComingSoon,
      isAccessible,
      isOwned,
      progressPercent: isOwned ? percent : 0,
      isCompleted: isOwned && prog.total > 0 && prog.completed === prog.total,
      checkoutUrl: c.checkout_url,
      trailerUrl: c.trailer_r2_key ? trailerMap.get(c.trailer_r2_key) ?? null : null,
    };
  };

  const allCards = courses.map(toCard);

  return {
    enrolled: allCards.filter((c) => c.isOwned),
    featured: allCards.filter((c) => c.isFeatured),
    newReleases: allCards.filter((c) => c.isNew),
    continueWatching: await getContinueWatching(userId, 10),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Continue watching
// ─────────────────────────────────────────────────────────────────────────

async function getContinueWatching(
  userId: string,
  limit: number,
): Promise<DashboardContinueItem[]> {
  const supabase = createAdminClient();

  const { data: progress } = await supabase
    .from('lesson_progress')
    .select('lesson_id, is_completed, updated_at, video_position_seconds')
    .eq('user_id', userId)
    .eq('is_completed', false)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (!progress?.length) return [];

  const lessonIds = progress.map((p) => p.lesson_id);

  const { data: lessons } = await supabase
    .from('lessons')
    .select(`
      id, slug, title, module_id, duration_seconds,
      modules!inner (
        course_id,
        courses!inner ( slug, title, thumbnail_landscape_url, thumbnail_url )
      )
    `)
    .in('id', lessonIds);

  type LessonRow = {
    id: string;
    slug: string;
    title: string;
    duration_seconds: number | null;
    modules: {
      courses: {
        slug: string;
        title: string;
        thumbnail_landscape_url: string | null;
        thumbnail_url: string | null;
      };
    };
  };

  const lessonMap = new Map(
    ((lessons ?? []) as unknown as LessonRow[]).map((l) => [l.id, l]),
  );

  return progress
    .map((p) => {
      const lesson = lessonMap.get(p.lesson_id);
      if (!lesson) return null;
      const course = lesson.modules?.courses;
      if (!course) return null;
      const total = lesson.duration_seconds ?? 0;
      const percent =
        total > 0
          ? Math.min(
              100,
              Math.round(((p.video_position_seconds ?? 0) / total) * 100),
            )
          : 0;
      return {
        courseSlug: course.slug,
        lessonSlug: lesson.slug,
        courseTitle: course.title,
        lessonTitle: lesson.title,
        thumbnailUrl: course.thumbnail_landscape_url ?? course.thumbnail_url,
        progressPercent: percent,
        updatedAt: p.updated_at,
      };
    })
    .filter((x): x is DashboardContinueItem => x !== null);
}

// ─────────────────────────────────────────────────────────────────────────
// Per-course progress (total published lessons vs completed by user)
// ─────────────────────────────────────────────────────────────────────────

async function getCourseProgressMap(
  userId: string,
  courseIds: string[],
): Promise<CourseProgressMap> {
  const map: CourseProgressMap = new Map();
  if (courseIds.length === 0) return map;

  const supabase = createAdminClient();

  const { data: modules } = await supabase
    .from('modules')
    .select('id, course_id')
    .in('course_id', courseIds)
    .eq('is_published', true);

  const moduleIdToCourse = new Map<string, string>();
  for (const m of modules ?? []) moduleIdToCourse.set(m.id, m.course_id);

  const moduleIds = [...moduleIdToCourse.keys()];
  if (moduleIds.length === 0) return map;

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, module_id')
    .in('module_id', moduleIds)
    .eq('is_published', true);

  const lessonIdToCourse = new Map<string, string>();
  for (const l of lessons ?? []) {
    const cid = moduleIdToCourse.get(l.module_id);
    if (cid) lessonIdToCourse.set(l.id, cid);
  }

  for (const cid of lessonIdToCourse.values()) {
    const cur = map.get(cid) ?? { total: 0, completed: 0 };
    cur.total += 1;
    map.set(cid, cur);
  }

  const lessonIds = [...lessonIdToCourse.keys()];
  if (lessonIds.length === 0) return map;

  const { data: completed } = await supabase
    .from('lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('is_completed', true)
    .in('lesson_id', lessonIds);

  for (const c of completed ?? []) {
    const cid = lessonIdToCourse.get(c.lesson_id);
    if (!cid) continue;
    const cur = map.get(cid) ?? { total: 0, completed: 0 };
    cur.completed += 1;
    map.set(cid, cur);
  }

  return map;
}

// ─── Dashboard stats ──────────────────────────────────────────────────────

export type ActiveCourseStat = {
  id: string;
  title: string;
  slug: string;
  percent: number;
  completedLessons: number;
  totalLessons: number;
};

export type DashboardStats = {
  /** Consecutive days of lesson_progress activity ending today/yesterday. */
  streakDays: number;
  /** Longest streak across the last 365 days — 0 if never. */
  streakLongest: number;
  /** Total minutes (rounded) of lessons touched in the last 7 days. */
  minutesThisWeek: number;
  /** Distinct lessons touched in the last 7 days. */
  lessonsThisWeek: number;
  /**
   * Most recently active course for this user, with completion ratio.
   * Null when the user has no lesson_progress at all.
   */
  activeCourse: ActiveCourseStat | null;
};

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const admin = createAdminClient();

  // Run independent queries in parallel.
  const [streakRes, minutesRes, recentRes] = await Promise.all([
    admin.rpc('compute_user_streak', { p_user_id: userId }),
    // Minutes + distinct lessons in the last 7 days.
    admin
      .from('lesson_progress')
      .select('lesson_id, lessons!inner(duration_seconds)')
      .eq('user_id', userId)
      .gte('updated_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
    // Most recent lesson_progress row — used to find the "active course".
    admin
      .from('lesson_progress')
      .select('lesson_id, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1),
  ]);

  const streakRow = Array.isArray(streakRes.data) ? streakRes.data[0] : null;
  const streakDays = (streakRow?.current_streak as number | undefined) ?? 0;
  const streakLongest = (streakRow?.longest_streak as number | undefined) ?? 0;

  // Minutes + lessons touched this week.
  let secondsTotal = 0;
  const uniqueLessonsThisWeek = new Set<string>();
  for (const row of minutesRes.data ?? []) {
    uniqueLessonsThisWeek.add(row.lesson_id as string);
    const nested = (row as unknown as { lessons?: { duration_seconds?: number | null } }).lessons;
    secondsTotal += Math.max(0, nested?.duration_seconds ?? 0);
  }
  const minutesThisWeek = Math.round(secondsTotal / 60);
  const lessonsThisWeek = uniqueLessonsThisWeek.size;

  // Active course — the one containing the most recent touched lesson.
  let activeCourse: ActiveCourseStat | null = null;
  const mostRecent = recentRes.data?.[0];
  if (mostRecent?.lesson_id) {
    const { data: lessonRow } = await admin
      .from('lessons')
      .select('module_id, modules!inner(course_id, courses!inner(id, title, slug))')
      .eq('id', mostRecent.lesson_id)
      .maybeSingle();

    const nested = (lessonRow as unknown as {
      modules?: { courses?: { id: string; title: string; slug: string } };
    })?.modules?.courses;

    if (nested) {
      // Total lessons in the course + completed lessons for this user.
      const { data: totalLessonsRows } = await admin
        .from('lessons')
        .select('id, modules!inner(course_id)')
        .eq('modules.course_id', nested.id);
      const lessonIds = (totalLessonsRows ?? []).map((r) => r.id as string);
      const totalLessons = lessonIds.length;

      let completedLessons = 0;
      if (lessonIds.length > 0) {
        const { data: completedRows } = await admin
          .from('lesson_progress')
          .select('lesson_id')
          .eq('user_id', userId)
          .eq('is_completed', true)
          .in('lesson_id', lessonIds);
        completedLessons = (completedRows ?? []).length;
      }

      const percent =
        totalLessons > 0
          ? Math.min(100, Math.round((completedLessons / totalLessons) * 100))
          : 0;

      activeCourse = {
        id: nested.id,
        title: nested.title,
        slug: nested.slug,
        percent,
        completedLessons,
        totalLessons,
      };
    }
  }

  return {
    streakDays,
    streakLongest,
    minutesThisWeek,
    lessonsThisWeek,
    activeCourse,
  };
}

// ─── Activity heatmap ─────────────────────────────────────────────────────

export type ActivityDay = {
  /** ISO date YYYY-MM-DD in UTC. */
  date: string;
  /** Distinct lessons touched on that day. */
  count: number;
};

/**
 * Returns one entry per day for the last `days` days (default 84 = 12
 * weeks), zero-filled. Counts DISTINCT lessons touched, not raw progress
 * rows — so re-watching the same lesson five times in a day still reads
 * as "one lesson touched", which keeps the intensity scale honest.
 */
export async function getUserActivityByDay(
  userId: string,
  days: number = 84,
): Promise<ActivityDay[]> {
  const admin = createAdminClient();
  const fromIso = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data } = await admin
    .from('lesson_progress')
    .select('lesson_id, updated_at')
    .eq('user_id', userId)
    .gte('updated_at', fromIso);

  const byDay = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const day = new Date(row.updated_at as string).toISOString().slice(0, 10);
    let set = byDay.get(day);
    if (!set) {
      set = new Set();
      byDay.set(day, set);
    }
    set.add(row.lesson_id as string);
  }

  // Fill the full window so the heatmap always renders a full grid even
  // for brand-new users.
  const out: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    out.push({ date: day, count: byDay.get(day)?.size ?? 0 });
  }
  return out;
}
