import { createAdminClient } from '@/core/supabase/admin';
import { requireAdmin } from '@/core/access/admin';
import { getAuthEmailsByIds } from '@/core/supabase/auth-user-lookup.server';
import { STUDENT_ROLES } from './student-roles';
import { paged, pagedForIds, ReportReadError } from './report-reads';

export { ReportReadError } from './report-reads';

function assertSuccessfulRead(value: unknown): void {
  if (
    value &&
    typeof value === 'object' &&
    'error' in value &&
    value.error
  ) {
    throw new ReportReadError();
  }
}

async function checked<T>(read: PromiseLike<T>): Promise<T> {
  const result = await read;
  assertSuccessfulRead(result);
  return result;
}

async function checkedAll<T extends readonly unknown[]>(
  reads: { [K in keyof T]: PromiseLike<T[K]> },
): Promise<T> {
  const results = (await Promise.all(reads)) as unknown as T;
  results.forEach(assertSuccessfulRead);
  return results;
}

async function emailLookup(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  try {
    return await getAuthEmailsByIds(admin.auth.admin, ids);
  } catch {
    throw new ReportReadError();
  }
}

// ─── Period model ──────────────────────────────────────────────────

export type ReportsPeriodKey = '30d' | 'month' | 'last_month' | '90d' | 'custom';

export interface ResolvedPeriod {
  key: ReportsPeriodKey;
  /** Inclusive ISO start of the window. */
  from: string;
  /** Exclusive ISO end of the window. */
  to: string;
  previousFrom: string;
  previousTo: string;
}

export function resolvePeriod(
  key: ReportsPeriodKey = '30d',
  customRange?: { from?: string; to?: string },
  now: Date = new Date(),
): ResolvedPeriod {
  if (key === 'custom' && customRange?.from && customRange.to) {
    const from = parseUtcCivilDate(customRange.from);
    const to = parseUtcCivilDate(customRange.to);
    if (from && to && to > from) {
      const span = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - span);
      return {
        key: 'custom',
        from: from.toISOString(),
        to: to.toISOString(),
        previousFrom: prevFrom.toISOString(),
        previousTo: from.toISOString(),
      };
    }
    // Invalid custom range → fall through to default.
    key = '30d';
  }
  return resolveNamedPeriod(key === 'custom' ? '30d' : key, now);
}

function parseUtcCivilDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function resolveNamedPeriod(
  key: Exclude<ReportsPeriodKey, 'custom'>,
  now: Date,
): ResolvedPeriod {
  switch (key) {
    case '30d': {
      const from = new Date(now.getTime() - 30 * 86_400_000);
      const prevFrom = new Date(now.getTime() - 60 * 86_400_000);
      return {
        key,
        from: from.toISOString(),
        to: now.toISOString(),
        previousFrom: prevFrom.toISOString(),
        previousTo: from.toISOString(),
      };
    }
    case '90d': {
      const from = new Date(now.getTime() - 90 * 86_400_000);
      const prevFrom = new Date(now.getTime() - 180 * 86_400_000);
      return {
        key,
        from: from.toISOString(),
        to: now.toISOString(),
        previousFrom: prevFrom.toISOString(),
        previousTo: from.toISOString(),
      };
    }
    case 'month': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const prevStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      );
      return {
        key,
        from: start.toISOString(),
        to: now.toISOString(),
        previousFrom: prevStart.toISOString(),
        previousTo: start.toISOString(),
      };
    }
    case 'last_month': {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      );
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const prevStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1),
      );
      return {
        key,
        from: start.toISOString(),
        to: end.toISOString(),
        previousFrom: prevStart.toISOString(),
        previousTo: start.toISOString(),
      };
    }
  }
}

// ─── DTOs ──────────────────────────────────────────────────────────

export interface ReportsKpis {
  totalStudents: number;
  activeInPeriod: number;
  activePreviousPeriod: number;
  newEnrollmentsInPeriod: number;
  newEnrollmentsPreviousPeriod: number;
  avgRating: number | null;
  totalRatings: number;
}

export interface AccessesBreakdown {
  today: number;
  yesterday: number;
  twoToSeven: number;
  sevenToFourteen: number;
  fourteenToThirty: number;
  inactiveOrNever: number;
  total: number;
}

export interface CoursePerformance {
  courseId: string;
  slug: string;
  title: string;
  totalAccess: number;
  withProgress: number;
  avgProgressPercent: number | null;
  avgRating: number | null;
  totalRatings: number;
}

export interface ExpiringEnrollment {
  enrollmentId: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  accessLevelName: string | null;
  expiresAt: string;
  daysUntilExpiry: number;
}

export interface RecentEnrollment {
  enrollmentId: string;
  userId: string;
  userName: string | null;
  accessLevelName: string | null;
  enrolledAt: string;
}

export interface TopStudent {
  userId: string;
  userName: string | null;
  userEmail: string;
  lessonsCompleted: number;
  coursesTouched: number;
}

export interface LessonEngagement {
  lessonId: string;
  title: string;
  courseTitle: string | null;
  courseSlug: string;
  lessonSlug: string;
  started: number;
  completed: number;
  completionRate: number | null;
  avgRating: number | null;
  totalRatings: number;
}

export interface LessonEngagementDive {
  mostWatched: LessonEngagement[];
  lowestCompletion: LessonEngagement[];
}

export interface ChatUsageCourse {
  courseId: string;
  courseTitle: string | null;
  conversations: number;
  uniqueUsers: number;
}

export interface ChatUsage {
  conversations: number;
  userMessages: number;
  assistantMessages: number;
  uniqueUsers: number;
  avgMessagesPerConversation: number | null;
  topCourses: ChatUsageCourse[];
}

export interface LiveClassAttendanceRow {
  liveClassId: string;
  title: string;
  courseTitles: string[];
  startsAt: string;
  durationMinutes: number;
  isPast: boolean;
  isLive: boolean;
  clickedUsers: number;
  totalClicks: number;
}

export interface LiveClassAttendance {
  totalSessions: number;
  upcoming: LiveClassAttendanceRow[];
  past: LiveClassAttendanceRow[];
}

export type ScoringTrigger =
  | 'lesson_completed'
  | 'rating_given'
  | 'enrollment_new'
  | 'chat_message';

export interface ScoringRule {
  trigger: ScoringTrigger;
  points: number;
}

export interface PointsStudent {
  userId: string;
  userName: string | null;
  userEmail: string;
  totalPoints: number;
  breakdown: Record<ScoringTrigger, number>;
}

export interface PointsLeaderboard {
  rules: ScoringRule[];
  students: PointsStudent[];
}

export interface CertificatesByCourse {
  courseId: string;
  courseTitle: string | null;
  count: number;
}

export interface CertificateRow {
  id: string;
  studentEmail: string;
  studentName: string | null;
  courseTitle: string | null;
  verificationCode: string;
  issuedAt: string;
}

export interface CertificatesReport {
  totalInPeriod: number;
  totalAllTime: number;
  byCourse: CertificatesByCourse[];
  recent: CertificateRow[];
}

export interface QuizStats {
  quizId: string;
  lessonTitle: string | null;
  courseTitle: string | null;
  passThresholdPercent: number;
  attempts: number;
  uniqueStudents: number;
  passes: number;
  passRatePercent: number;
  avgScorePercent: number | null;
  lastAttemptAt: string | null;
}

export interface QuizzesReport {
  totalAttemptsInPeriod: number;
  totalQuizzes: number;
  perQuiz: QuizStats[];
}

export type LifecycleSegment =
  | 'new'        // joined in the last 7 days
  | 'active'     // logged in within the last 7 days (and not new)
  | 'engaged'    // logged in 8-30 days ago
  | 'inactive'   // 31-90 days
  | 'dormant'    // >90 days
  | 'never';     // never logged in

export interface LifecycleSegmentStat {
  segment: LifecycleSegment;
  count: number;
  /** Percentage of total students. */
  percent: number;
}

export interface UsersLifecycleReport {
  totalStudents: number;
  segments: LifecycleSegmentStat[];
}

export interface EmailEventCount {
  eventType: string;
  count: number;
}

export interface EmailBounceRow {
  email: string;
  eventType: string;
  subject: string | null;
  occurredAt: string;
}

export interface EmailActivityRow {
  email: string;
  eventType: string;
  subject: string | null;
  tag: string | null;
  occurredAt: string;
}

export interface EmailReport {
  /** Whether the Brevo webhook has ever delivered an event. Drives the empty state. */
  configured: boolean;
  totalSentInPeriod: number;
  totalBouncedInPeriod: number;
  totalBlockedInPeriod: number;
  bounceRatePercent: number;
  byEventType: EmailEventCount[];
  recentBounces: EmailBounceRow[];
  /** Up to 50 recent events of any type. */
  recentActivity: EmailActivityRow[];
  /** Distinct hard-failure emails sampled from the 50 recent bounces. */
  invalidEmails: string[];
}

export interface ReportsData {
  period: ResolvedPeriod;
  kpis: ReportsKpis;
  accesses: AccessesBreakdown;
  courses: CoursePerformance[];
  expiringSoon: ExpiringEnrollment[];
  recentEnrollments: RecentEnrollment[];
  topStudents: TopStudent[];
  lessonDive: LessonEngagementDive;
  chatUsage: ChatUsage;
  liveClassAttendance: LiveClassAttendance;
  pointsLeaderboard: PointsLeaderboard;
  certificates: CertificatesReport;
  quizzes: QuizzesReport;
  usersLifecycle: UsersLifecycleReport;
  emails: EmailReport;
}

// ─── Helpers ───────────────────────────────────────────────────────

function startOfTodayIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

function startOfYesterdayIso(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  ).toISOString();
}

// ─── Section 1 — KPIs ──────────────────────────────────────────────

async function getKpis(period: ResolvedPeriod): Promise<ReportsKpis> {
  const admin = createAdminClient();

  const [
    totalStudentsRes,
    activeRes,
    activePrevRes,
    newEnrollRes,
    newEnrollPrevRes,
    ratingsRes,
  ] = await checkedAll([
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('role', STUDENT_ROLES),
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('role', STUDENT_ROLES)
      .gte('last_login_at', period.from)
      .lt('last_login_at', period.to),
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('role', STUDENT_ROLES)
      .gte('last_login_at', period.previousFrom)
      .lt('last_login_at', period.previousTo),
    admin
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .gte('enrolled_at', period.from)
      .lt('enrolled_at', period.to)
      .eq('is_active', true),
    admin
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .gte('enrolled_at', period.previousFrom)
      .lt('enrolled_at', period.previousTo),
    paged(
      (from, to) =>
        admin
          .from('lesson_ratings')
          .select('user_id, lesson_id, stars', { count: 'exact' })
          .order('lesson_id', { ascending: true })
          .order('user_id', { ascending: true })
          .range(from, to),
      row => JSON.stringify([row.lesson_id, row.user_id]),
    ),
  ]);

  const ratingRows = ratingsRes.data ?? [];
  const total = ratingRows.length;
  const avg =
    total > 0
      ? ratingRows.reduce((s, r) => s + Number(r.stars), 0) / total
      : null;

  return {
    totalStudents: totalStudentsRes.count ?? 0,
    activeInPeriod: activeRes.count ?? 0,
    activePreviousPeriod: activePrevRes.count ?? 0,
    newEnrollmentsInPeriod: newEnrollRes.count ?? 0,
    newEnrollmentsPreviousPeriod: newEnrollPrevRes.count ?? 0,
    avgRating: avg !== null ? Number(avg.toFixed(2)) : null,
    totalRatings: total,
  };
}

// ─── Section 2 — Accesses breakdown ─────────────────────────────────

async function getAccessesBreakdown(now: Date): Promise<AccessesBreakdown> {
  const admin = createAdminClient();

  const { data } = await checked(paged(
    (from, to) =>
      admin
        .from('profiles')
        .select('id, last_login_at', { count: 'exact' })
        .in('role', STUDENT_ROLES)
        .order('id', { ascending: true })
        .range(from, to),
    row => row.id,
  ));

  const rows = data ?? [];
  const nowMs = now.getTime();
  const todayMs = new Date(startOfTodayIso(now)).getTime();
  const yesterdayMs = new Date(startOfYesterdayIso(now)).getTime();
  const sevenDaysMs = nowMs - 7 * 86_400_000;
  const fourteenDaysMs = nowMs - 14 * 86_400_000;
  const thirtyDaysMs = nowMs - 30 * 86_400_000;

  const out: AccessesBreakdown = {
    today: 0,
    yesterday: 0,
    twoToSeven: 0,
    sevenToFourteen: 0,
    fourteenToThirty: 0,
    inactiveOrNever: 0,
    total: rows.length,
  };

  for (const r of rows) {
    if (!r.last_login_at) {
      out.inactiveOrNever += 1;
      continue;
    }
    const t = new Date(r.last_login_at).getTime();
    if (t >= todayMs) out.today += 1;
    else if (t >= yesterdayMs) out.yesterday += 1;
    else if (t >= sevenDaysMs) out.twoToSeven += 1;
    else if (t >= fourteenDaysMs) out.sevenToFourteen += 1;
    else if (t >= thirtyDaysMs) out.fourteenToThirty += 1;
    else out.inactiveOrNever += 1;
  }

  return out;
}

// ─── Section 3 — Courses performance ────────────────────────────────

async function getCoursesPerformance(): Promise<CoursePerformance[]> {
  const admin = createAdminClient();

  // Parallel loads.
  const [coursesRes, lessonsRes, alcRes, enrollRes, progressRes, ratingsRes] =
    await checkedAll([
      paged(
        (from, to) =>
          admin
            .from('courses')
            .select('id, slug, title, sort_order', { count: 'exact' })
            .eq('is_published', true)
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        row => row.id,
      ),

      paged(
        (from, to) =>
          admin
            .from('lessons')
            .select('id, module_id, modules!inner(course_id)', { count: 'exact' })
            .order('id', { ascending: true })
            .range(from, to),
        row => row.id,
      ),

      paged(
        (from, to) =>
          admin
            .from('access_level_courses')
            .select('access_level_id, course_id', { count: 'exact' })
            .order('access_level_id', { ascending: true })
            .order('course_id', { ascending: true })
            .range(from, to),
        row => JSON.stringify([row.access_level_id, row.course_id]),
      ),

      paged(
        (from, to) =>
          admin
            .from('enrollments')
            .select('id, user_id, access_level_id', { count: 'exact' })
            .eq('is_active', true)
            .order('id', { ascending: true })
            .range(from, to),
        row => row.id,
      ),

      paged(
        (from, to) =>
          admin
            .from('lesson_progress')
            .select('id, user_id, lesson_id, is_completed, lessons!inner(module_id, modules!inner(course_id))', { count: 'exact' })
            .order('id', { ascending: true })
            .range(from, to),
        row => row.id,
      ),

      paged(
        (from, to) =>
          admin
            .from('lesson_ratings')
            .select('user_id, lesson_id, stars, lessons!inner(module_id, modules!inner(course_id))', { count: 'exact' })
            .order('lesson_id', { ascending: true })
            .order('user_id', { ascending: true })
            .range(from, to),
        row => JSON.stringify([row.lesson_id, row.user_id]),
      ),
    ]);

  const courses = coursesRes.data ?? [];
  if (courses.length === 0) return [];

  // Index lessons by course to know the total lesson count per course.
  type LessonRow = {
    id: string;
    modules: { course_id: string } | { course_id: string }[] | null;
  };
  const lessonsByCourse = new Map<string, number>();
  for (const row of (lessonsRes.data ?? []) as LessonRow[]) {
    const modules = Array.isArray(row.modules) ? row.modules[0] : row.modules;
    const courseId = modules?.course_id;
    if (!courseId) continue;
    lessonsByCourse.set(courseId, (lessonsByCourse.get(courseId) ?? 0) + 1);
  }

  // total_access: distinct users per course via access_level → enrollments.
  const alcByLevel = new Map<string, string[]>();
  for (const r of alcRes.data ?? []) {
    const list = alcByLevel.get(r.access_level_id) ?? [];
    list.push(r.course_id);
    alcByLevel.set(r.access_level_id, list);
  }
  const accessSetByCourse = new Map<string, Set<string>>();
  for (const e of enrollRes.data ?? []) {
    const courseIds = alcByLevel.get(e.access_level_id) ?? [];
    for (const courseId of courseIds) {
      const set = accessSetByCourse.get(courseId) ?? new Set();
      set.add(e.user_id);
      accessSetByCourse.set(courseId, set);
    }
  }

  // withProgress + avg completion per user per course.
  type ProgressRow = {
    user_id: string;
    lesson_id: string;
    is_completed: boolean | null;
    lessons:
      | { modules: { course_id: string } | { course_id: string }[] | null }
      | { modules: { course_id: string } | { course_id: string }[] | null }[]
      | null;
  };
  // (user, course) -> completed lesson count
  const completedByUserCourse = new Map<string, number>();
  // (course) -> set of users with any interaction
  const progressSetByCourse = new Map<string, Set<string>>();
  for (const p of (progressRes.data ?? []) as ProgressRow[]) {
    const lessons = Array.isArray(p.lessons) ? p.lessons[0] : p.lessons;
    const modules = lessons
      ? Array.isArray(lessons.modules)
        ? lessons.modules[0]
        : lessons.modules
      : null;
    const courseId = modules?.course_id;
    if (!courseId) continue;

    const usersSet = progressSetByCourse.get(courseId) ?? new Set();
    usersSet.add(p.user_id);
    progressSetByCourse.set(courseId, usersSet);

    if (p.is_completed) {
      const key = `${p.user_id}|${courseId}`;
      completedByUserCourse.set(key, (completedByUserCourse.get(key) ?? 0) + 1);
    }
  }

  // Ratings aggregated per course.
  type RatingRow = {
    stars: number;
    lessons:
      | { modules: { course_id: string } | { course_id: string }[] | null }
      | { modules: { course_id: string } | { course_id: string }[] | null }[]
      | null;
  };
  const ratingsByCourse = new Map<string, { sum: number; count: number }>();
  for (const r of (ratingsRes.data ?? []) as RatingRow[]) {
    const lessons = Array.isArray(r.lessons) ? r.lessons[0] : r.lessons;
    const modules = lessons
      ? Array.isArray(lessons.modules)
        ? lessons.modules[0]
        : lessons.modules
      : null;
    const courseId = modules?.course_id;
    if (!courseId) continue;
    const cur = ratingsByCourse.get(courseId) ?? { sum: 0, count: 0 };
    cur.sum += Number(r.stars);
    cur.count += 1;
    ratingsByCourse.set(courseId, cur);
  }

  // Assemble per-course rows.
  return courses.map((c) => {
    const totalLessons = lessonsByCourse.get(c.id) ?? 0;
    const totalAccess = accessSetByCourse.get(c.id)?.size ?? 0;
    const withProgress = progressSetByCourse.get(c.id)?.size ?? 0;
    const rating = ratingsByCourse.get(c.id);

    // Avg progress %: for every user with ANY progress, completed / totalLessons.
    let avgProgressPercent: number | null = null;
    if (totalLessons > 0 && withProgress > 0) {
      let sum = 0;
      const users = progressSetByCourse.get(c.id) ?? new Set();
      for (const userId of users) {
        const completed = completedByUserCourse.get(`${userId}|${c.id}`) ?? 0;
        sum += completed / totalLessons;
      }
      avgProgressPercent = Math.round((sum / users.size) * 100);
    }

    return {
      courseId: c.id,
      slug: c.slug,
      title: c.title,
      totalAccess,
      withProgress,
      avgProgressPercent,
      avgRating: rating ? Number((rating.sum / rating.count).toFixed(2)) : null,
      totalRatings: rating?.count ?? 0,
    };
  });
}

// ─── Section 4 — Expiring soon ──────────────────────────────────────

async function getExpiringSoon(
  now: Date,
  days = 30,
): Promise<ExpiringEnrollment[]> {
  const admin = createAdminClient();

  const horizon = new Date(now.getTime() + days * 86_400_000).toISOString();

  const enrollRes = await checked(admin
      .from('enrollments')
      .select(
        'id, user_id, expires_at, access_level_id, profiles!inner(display_name), access_levels!inner(name)',
      )
      .eq('is_active', true)
      .not('expires_at', 'is', null)
      .gte('expires_at', now.toISOString())
      .lte('expires_at', horizon)
      .order('expires_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(100));

  const emailById = await emailLookup(
    admin,
    (enrollRes.data ?? []).map(row => row.user_id),
  );

  type Row = {
    id: string;
    user_id: string;
    expires_at: string;
    profiles: { display_name: string } | { display_name: string }[] | null;
    access_levels: { name: string } | { name: string }[] | null;
  };

  return ((enrollRes.data ?? []) as Row[]).map((r) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const level = Array.isArray(r.access_levels)
      ? r.access_levels[0]
      : r.access_levels;
    const msUntil = new Date(r.expires_at).getTime() - now.getTime();
    return {
      enrollmentId: r.id,
      userId: r.user_id,
      userName: profile?.display_name ?? null,
      userEmail: emailById.get(r.user_id) ?? '',
      accessLevelName: level?.name ?? null,
      expiresAt: r.expires_at,
      daysUntilExpiry: Math.max(0, Math.ceil(msUntil / 86_400_000)),
    };
  });
}

// ─── Section 5 — Recent enrollments ────────────────────────────────

async function getRecentEnrollments(limit = 20): Promise<RecentEnrollment[]> {
  const admin = createAdminClient();

  const { data } = await checked(admin
    .from('enrollments')
    .select(
      'id, user_id, enrolled_at, profiles!inner(display_name), access_levels!inner(name)',
    )
    .eq('is_active', true)
    .order('enrolled_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(limit));

  type Row = {
    id: string;
    user_id: string;
    enrolled_at: string;
    profiles: { display_name: string } | { display_name: string }[] | null;
    access_levels: { name: string } | { name: string }[] | null;
  };

  return ((data ?? []) as Row[]).map((r) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const level = Array.isArray(r.access_levels)
      ? r.access_levels[0]
      : r.access_levels;
    return {
      enrollmentId: r.id,
      userId: r.user_id,
      userName: profile?.display_name ?? null,
      accessLevelName: level?.name ?? null,
      enrolledAt: r.enrolled_at,
    };
  });
}

// ─── Section 6 — Top engaged students ──────────────────────────────

async function getTopStudents(
  period: ResolvedPeriod,
  limit = 10,
): Promise<TopStudent[]> {
  const admin = createAdminClient();

  // Every completed lesson in the window, joined up to the course.
  const { data: progressRows } = await checked(paged(
    (from, to) =>
      admin
        .from('lesson_progress')
        .select('id, user_id, lesson_id, completed_at, lessons!inner(module_id, modules!inner(course_id))', { count: 'exact' })
        .eq('is_completed', true)
        .gte('completed_at', period.from)
        .lt('completed_at', period.to)
        .order('id', { ascending: true })
        .range(from, to),
    row => row.id,
  ));

  type Row = {
    user_id: string;
    lessons:
      | { modules: { course_id: string } | { course_id: string }[] | null }
      | { modules: { course_id: string } | { course_id: string }[] | null }[]
      | null;
  };

  const stats = new Map<string, { completed: number; courses: Set<string> }>();
  for (const r of (progressRows ?? []) as Row[]) {
    const lessons = Array.isArray(r.lessons) ? r.lessons[0] : r.lessons;
    const modules = lessons
      ? Array.isArray(lessons.modules)
        ? lessons.modules[0]
        : lessons.modules
      : null;
    const courseId = modules?.course_id;

    const cur = stats.get(r.user_id) ?? { completed: 0, courses: new Set() };
    cur.completed += 1;
    if (courseId) cur.courses.add(courseId);
    stats.set(r.user_id, cur);
  }

  if (stats.size === 0) return [];

  // Top N by completions.
  const top = [...stats.entries()]
    .sort((a, b) => b[1].completed - a[1].completed)
    .slice(0, limit);
  const topIds = top.map(([id]) => id);

  // Resolve names + emails.
  const [{ data: profiles }, emailById] = await checkedAll([
    pagedForIds(
      topIds,
      (ids, from, to) =>
        admin
          .from('profiles')
          .select('id, display_name', { count: 'exact' })
          .in('id', ids)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
    emailLookup(admin, topIds),
  ]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  return top.map(([userId, s]) => ({
    userId,
    userName: nameById.get(userId) ?? null,
    userEmail: emailById.get(userId) ?? '',
    lessonsCompleted: s.completed,
    coursesTouched: s.courses.size,
  }));
}

// ─── Section 7 — Lesson engagement dive ────────────────────────────

async function getLessonEngagement(
  period: ResolvedPeriod,
): Promise<LessonEngagementDive> {
  const admin = createAdminClient();

  // Progress rows within the period so stats reflect the selected window.
  const { data: progressRows } = await checked(paged(
    (from, to) =>
      admin
        .from('lesson_progress')
        .select('id, lesson_id, user_id, is_completed', { count: 'exact' })
        .gte('updated_at', period.from)
        .lt('updated_at', period.to)
        .order('id', { ascending: true })
        .range(from, to),
    row => row.id,
  ));

  // Aggregate started + completed per lesson.
  type Tally = { started: Set<string>; completed: Set<string> };
  const byLesson = new Map<string, Tally>();
  for (const r of progressRows ?? []) {
    const t = byLesson.get(r.lesson_id) ?? {
      started: new Set(),
      completed: new Set(),
    };
    t.started.add(r.user_id);
    if (r.is_completed) t.completed.add(r.user_id);
    byLesson.set(r.lesson_id, t);
  }

  if (byLesson.size === 0) return { mostWatched: [], lowestCompletion: [] };

  const lessonIds = [...byLesson.keys()];

  // Titles + course context for those lessons.
  const { data: lessons } = await checked(pagedForIds(
    lessonIds,
    (ids, from, to) =>
      admin
        .from('lessons')
        .select('id, title, slug, modules!inner(course_id, courses!inner(title, slug))', { count: 'exact' })
        .in('id', ids)
        .order('id', { ascending: true })
        .range(from, to),
    row => row.id,
  ));

  type LessonRow = {
    id: string;
    title: string;
    slug: string;
    modules:
      | {
          course_id: string;
          courses:
            | { title: string; slug: string }
            | { title: string; slug: string }[]
            | null;
        }
      | {
          course_id: string;
          courses:
            | { title: string; slug: string }
            | { title: string; slug: string }[]
            | null;
        }[]
      | null;
  };

  const lessonMetaById = new Map<
    string,
    { title: string; slug: string; courseTitle: string | null; courseSlug: string }
  >();
  for (const l of (lessons ?? []) as LessonRow[]) {
    const modules = Array.isArray(l.modules) ? l.modules[0] : l.modules;
    const course = modules?.courses
      ? Array.isArray(modules.courses)
        ? modules.courses[0]
        : modules.courses
      : null;
    lessonMetaById.set(l.id, {
      title: l.title,
      slug: l.slug,
      courseTitle: course?.title ?? null,
      courseSlug: course?.slug ?? '',
    });
  }

  // Ratings aggregated per lesson.
  const { data: ratings } = await checked(pagedForIds(
    lessonIds,
    (ids, from, to) =>
      admin
        .from('lesson_ratings')
        .select('user_id, lesson_id, stars', { count: 'exact' })
        .in('lesson_id', ids)
        .order('lesson_id', { ascending: true })
        .order('user_id', { ascending: true })
        .range(from, to),
    row => JSON.stringify([row.lesson_id, row.user_id]),
  ));
  const ratingByLesson = new Map<string, { sum: number; count: number }>();
  for (const r of ratings ?? []) {
    const cur = ratingByLesson.get(r.lesson_id) ?? { sum: 0, count: 0 };
    cur.sum += Number(r.stars);
    cur.count += 1;
    ratingByLesson.set(r.lesson_id, cur);
  }

  // Materialise the full list, then pick ranked views.
  const allStats: LessonEngagement[] = [];
  for (const [lessonId, tally] of byLesson) {
    const meta = lessonMetaById.get(lessonId);
    if (!meta) continue;
    const started = tally.started.size;
    const completed = tally.completed.size;
    const completionRate = started > 0 ? Math.round((completed / started) * 100) : null;
    const rating = ratingByLesson.get(lessonId);
    allStats.push({
      lessonId,
      title: meta.title,
      courseTitle: meta.courseTitle,
      courseSlug: meta.courseSlug,
      lessonSlug: meta.slug,
      started,
      completed,
      completionRate,
      avgRating: rating ? Number((rating.sum / rating.count).toFixed(2)) : null,
      totalRatings: rating?.count ?? 0,
    });
  }

  const mostWatched = [...allStats]
    .sort((a, b) => b.started - a.started)
    .slice(0, 5);

  // Drop-off candidates — need enough sample to trust the ratio.
  const MIN_SAMPLE = 3;
  const lowestCompletion = [...allStats]
    .filter((s) => s.started >= MIN_SAMPLE && s.completionRate !== null)
    .sort((a, b) => (a.completionRate ?? 100) - (b.completionRate ?? 100))
    .slice(0, 5);

  return { mostWatched, lowestCompletion };
}

// ─── Section 8 — Ask the Course chat usage ─────────────────────────

async function getChatUsage(period: ResolvedPeriod): Promise<ChatUsage> {
  const admin = createAdminClient();

  const [convRes, msgRes] = await checkedAll([
    paged(
      (from, to) =>
        admin
          .from('chat_conversations')
          .select('id, user_id, course_id, courses(title)', { count: 'exact' })
          .gte('created_at', period.from)
          .lt('created_at', period.to)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
    paged(
      (from, to) =>
        admin
          .from('chat_messages')
          .select('id, role, conversation_id, created_at', { count: 'exact' })
          .gte('created_at', period.from)
          .lt('created_at', period.to)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
  ]);

  type Conv = {
    id: string;
    user_id: string;
    course_id: string;
    courses: { title: string } | { title: string }[] | null;
  };

  const convs = (convRes.data ?? []) as Conv[];
  const messages = msgRes.data ?? [];

  const userMessages = messages.filter((m) => m.role === 'user').length;
  const assistantMessages = messages.filter((m) => m.role === 'assistant').length;
  const uniqueUsers = new Set(convs.map((c) => c.user_id)).size;
  const avgMessagesPerConversation =
    convs.length > 0 ? Number((messages.length / convs.length).toFixed(1)) : null;

  // Per-course rollup.
  const byCourse = new Map<
    string,
    { title: string | null; conversations: number; users: Set<string> }
  >();
  for (const c of convs) {
    const course = Array.isArray(c.courses) ? c.courses[0] : c.courses;
    const entry = byCourse.get(c.course_id) ?? {
      title: course?.title ?? null,
      conversations: 0,
      users: new Set(),
    };
    entry.conversations += 1;
    entry.users.add(c.user_id);
    byCourse.set(c.course_id, entry);
  }

  const topCourses: ChatUsageCourse[] = [...byCourse.entries()]
    .map(([courseId, e]) => ({
      courseId,
      courseTitle: e.title,
      conversations: e.conversations,
      uniqueUsers: e.users.size,
    }))
    .sort((a, b) => b.conversations - a.conversations)
    .slice(0, 5);

  return {
    conversations: convs.length,
    userMessages,
    assistantMessages,
    uniqueUsers,
    avgMessagesPerConversation,
    topCourses,
  };
}

// ─── Section 9 — Live class attendance ─────────────────────────────

async function getLiveClassAttendance(
  period: ResolvedPeriod,
  now: Date,
): Promise<LiveClassAttendance> {
  const admin = createAdminClient();

  // Sessions starting in the period, with their clicks in the same window.
  const [{ data: sessions }, { data: clicks }] = await checkedAll([
    paged(
      (from, to) =>
        admin
          .from('live_classes')
          .select('id, title, starts_at, duration_minutes', { count: 'exact' })
          .gte('starts_at', period.from)
          .lt('starts_at', period.to)
          .order('starts_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
    paged(
      (from, to) =>
        admin
          .from('live_class_clicks')
          .select('id, live_class_id, user_id, clicked_at', { count: 'exact' })
          .gte('clicked_at', period.from)
          .lt('clicked_at', period.to)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
  ]);

  const { data: courseLinks } = await pagedForIds(
    sessions.map(session => session.id),
    (ids, from, to) => admin
      .from('live_class_courses')
      .select('live_class_id, course_id, courses(title)', { count: 'exact' })
      .in('live_class_id', ids)
      .order('live_class_id', { ascending: true })
      .order('course_id', { ascending: true })
      .range(from, to),
    row => JSON.stringify([row.live_class_id, row.course_id]),
  );
  const titlesByClass = new Map<string, string[]>();
  for (const link of courseLinks) {
    const course = Array.isArray(link.courses) ? link.courses[0] : link.courses;
    if (!course?.title) continue;
    const titles = titlesByClass.get(link.live_class_id) ?? [];
    titles.push(course.title);
    titlesByClass.set(link.live_class_id, titles);
  }

  const clicksByClass = new Map<
    string,
    { users: Set<string>; total: number }
  >();
  for (const c of clicks ?? []) {
    const entry = clicksByClass.get(c.live_class_id) ?? {
      users: new Set(),
      total: 0,
    };
    entry.users.add(c.user_id);
    entry.total += 1;
    clicksByClass.set(c.live_class_id, entry);
  }

  const nowMs = now.getTime();
  const rows: LiveClassAttendanceRow[] = sessions.map(
    (s) => {
      const startMs = new Date(s.starts_at).getTime();
      const endMs = startMs + s.duration_minutes * 60_000;
      const stats = clicksByClass.get(s.id);
      return {
        liveClassId: s.id,
        title: s.title,
        courseTitles: titlesByClass.get(s.id) ?? [],
        startsAt: s.starts_at,
        durationMinutes: s.duration_minutes,
        isPast: nowMs >= endMs,
        isLive: nowMs >= startMs && nowMs < endMs,
        clickedUsers: stats?.users.size ?? 0,
        totalClicks: stats?.total ?? 0,
      };
    },
  );

  return {
    totalSessions: rows.length,
    upcoming: rows.filter((r) => !r.isPast),
    past: rows.filter((r) => r.isPast),
  };
}

// ─── Section 10 — Points leaderboard ───────────────────────────────

const DEFAULT_RULES: Record<ScoringTrigger, number> = {
  lesson_completed: 10,
  rating_given: 5,
  enrollment_new: 20,
  chat_message: 2,
};

async function loadScoringRules(): Promise<Record<ScoringTrigger, number>> {
  const admin = createAdminClient();
  const { data } = await checked(
    admin.from('scoring_rules').select('trigger, points'),
  );
  const out = { ...DEFAULT_RULES };
  for (const r of data ?? []) {
    const key = r.trigger as ScoringTrigger;
    if (key in out) out[key] = Number(r.points);
  }
  return out;
}

async function getPointsLeaderboard(
  period: ResolvedPeriod,
  limit = 10,
): Promise<PointsLeaderboard> {
  const admin = createAdminClient();
  const rules = await loadScoringRules();

  // Read every page in the period before ranking, so a later page can
  // change the leader instead of being silently excluded.
  const [
    { data: completions },
    { data: ratings },
    { data: enrollments },
    { data: chatMessages },
  ] = await checkedAll([
    paged(
      (from, to) =>
        admin
          .from('lesson_progress')
          .select('id, user_id', { count: 'exact' })
          .eq('is_completed', true)
          .gte('completed_at', period.from)
          .lt('completed_at', period.to)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
    paged(
      (from, to) =>
        admin
          .from('lesson_ratings')
          .select('lesson_id, user_id', { count: 'exact' })
          .gte('created_at', period.from)
          .lt('created_at', period.to)
          .order('lesson_id', { ascending: true })
          .order('user_id', { ascending: true })
          .range(from, to),
      row => JSON.stringify([row.lesson_id, row.user_id]),
    ),
    paged(
      (from, to) =>
        admin
          .from('enrollments')
          .select('id, user_id', { count: 'exact' })
          .eq('is_active', true)
          .gte('enrolled_at', period.from)
          .lt('enrolled_at', period.to)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
    paged(
      (from, to) =>
        admin
          .from('chat_messages')
          .select('id, conversation_id, role, chat_conversations!inner(user_id)', { count: 'exact' })
          .eq('role', 'user')
          .gte('created_at', period.from)
          .lt('created_at', period.to)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
  ]);

  // Per-user counts per trigger.
  type Counts = Record<ScoringTrigger, number>;
  const zeroCounts = (): Counts => ({
    lesson_completed: 0,
    rating_given: 0,
    enrollment_new: 0,
    chat_message: 0,
  });
  const byUser = new Map<string, Counts>();
  const bump = (userId: string, trig: ScoringTrigger) => {
    const c = byUser.get(userId) ?? zeroCounts();
    c[trig] += 1;
    byUser.set(userId, c);
  };
  for (const r of completions ?? []) bump(r.user_id, 'lesson_completed');
  for (const r of ratings ?? []) bump(r.user_id, 'rating_given');
  for (const r of enrollments ?? []) bump(r.user_id, 'enrollment_new');

  type ChatRow = {
    chat_conversations:
      | { user_id: string }
      | { user_id: string }[]
      | null;
  };
  for (const r of (chatMessages ?? []) as ChatRow[]) {
    const conv = Array.isArray(r.chat_conversations)
      ? r.chat_conversations[0]
      : r.chat_conversations;
    if (conv?.user_id) bump(conv.user_id, 'chat_message');
  }

  if (byUser.size === 0) {
    return {
      rules: (Object.entries(rules) as [ScoringTrigger, number][]).map(
        ([trigger, points]) => ({ trigger, points }),
      ),
      students: [],
    };
  }

  // Score + sort.
  const scored = [...byUser.entries()].map(([userId, counts]) => {
    const totalPoints =
      counts.lesson_completed * rules.lesson_completed +
      counts.rating_given * rules.rating_given +
      counts.enrollment_new * rules.enrollment_new +
      counts.chat_message * rules.chat_message;
    return {
      userId,
      counts,
      totalPoints,
    };
  });
  scored.sort((a, b) => b.totalPoints - a.totalPoints);

  const topSlice = scored.slice(0, limit);
  const topIds = topSlice.map((s) => s.userId);

  const [{ data: profiles }, emailById] = await checkedAll([
    pagedForIds(
      topIds,
      (ids, from, to) =>
        admin
          .from('profiles')
          .select('id, display_name', { count: 'exact' })
          .in('id', ids)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
    emailLookup(admin, topIds),
  ]);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name]),
  );

  const students: PointsStudent[] = topSlice.map((s) => ({
    userId: s.userId,
    userName: nameById.get(s.userId) ?? null,
    userEmail: emailById.get(s.userId) ?? '',
    totalPoints: s.totalPoints,
    breakdown: {
      lesson_completed: s.counts.lesson_completed * rules.lesson_completed,
      rating_given: s.counts.rating_given * rules.rating_given,
      enrollment_new: s.counts.enrollment_new * rules.enrollment_new,
      chat_message: s.counts.chat_message * rules.chat_message,
    },
  }));

  return {
    rules: (Object.entries(rules) as [ScoringTrigger, number][]).map(
      ([trigger, points]) => ({ trigger, points }),
    ),
    students,
  };
}

// ─── Orchestrator ──────────────────────────────────────────────────

// ─── Certificates ─────────────────────────────────────────────────

async function getCertificatesReport(
  period: ResolvedPeriod,
): Promise<CertificatesReport> {
  const admin = createAdminClient();

  const [periodCountRes, allTimeCountRes, recentRes] = await checkedAll([
    admin
      .from('certificates')
      .select('id', { count: 'exact', head: true })
      .gte('issued_at', period.from)
      .lt('issued_at', period.to),
    admin
      .from('certificates')
      .select('id', { count: 'exact', head: true }),
    admin
      .from('certificates')
      .select('id, course_id, user_id, verification_code, issued_at')
      .order('issued_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(50),
  ]);

  const recentRows = recentRes.data ?? [];

  // Resolve course titles + student profile/auth in one go.
  const courseIds = Array.from(new Set(recentRows.map((r) => r.course_id)));
  const userIds = Array.from(new Set(recentRows.map((r) => r.user_id)));

  const [coursesRes, profilesRes] = await checkedAll([
    courseIds.length
      ? pagedForIds(
        courseIds,
        (ids, from, to) =>
          admin
            .from('courses')
            .select('id, title', { count: 'exact' })
            .in('id', ids)
            .order('id', { ascending: true })
            .range(from, to),
        row => row.id,
      )
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    userIds.length
      ? pagedForIds(
        userIds,
        (ids, from, to) =>
          admin
            .from('profiles')
            .select('id, display_name', { count: 'exact' })
            .in('id', ids)
            .order('id', { ascending: true })
            .range(from, to),
        row => row.id,
      )
      : Promise.resolve({
          data: [] as Array<{ id: string; display_name: string | null }>,
        }),
  ]);

  const courseTitleById = new Map<string, string>();
  for (const c of coursesRes.data ?? []) {
    courseTitleById.set(c.id, c.title);
  }
  const profileNameById = new Map<string, string | null>();
  for (const p of profilesRes.data ?? []) {
    profileNameById.set(p.id, p.display_name);
  }

  const emailById = await emailLookup(admin, userIds);

  const recent: CertificateRow[] = recentRows.map((r) => ({
    id: r.id,
    studentEmail: emailById.get(r.user_id) ?? '—',
    studentName: profileNameById.get(r.user_id) ?? null,
    courseTitle: courseTitleById.get(r.course_id) ?? null,
    verificationCode: r.verification_code,
    issuedAt: r.issued_at,
  }));

  // Bucket by course for the breakdown panel. Counts are all-time.
  const byCourseMap = new Map<string, { title: string | null; count: number }>();
  const { data: allCerts } = await checked(paged(
    (from, to) =>
      admin
        .from('certificates')
        .select('id, course_id', { count: 'exact' })
        .order('id', { ascending: true })
        .range(from, to),
    row => row.id,
  ));
  for (const c of allCerts ?? []) {
    const cur = byCourseMap.get(c.course_id) ?? {
      title: courseTitleById.get(c.course_id) ?? null,
      count: 0,
    };
    cur.count += 1;
    byCourseMap.set(c.course_id, cur);
  }
  // Backfill titles for courses that aren't in recent rows.
  const missingTitleIds = Array.from(byCourseMap.entries())
    .filter(([, v]) => v.title === null)
    .map(([id]) => id);
  if (missingTitleIds.length > 0) {
    const { data: extraCourses } = await checked(pagedForIds(
      missingTitleIds,
      (ids, from, to) =>
        admin
          .from('courses')
          .select('id, title', { count: 'exact' })
          .in('id', ids)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ));
    for (const c of extraCourses ?? []) {
      const cur = byCourseMap.get(c.id);
      if (cur) cur.title = c.title;
    }
  }
  const byCourse: CertificatesByCourse[] = Array.from(byCourseMap.entries())
    .map(([courseId, v]) => ({
      courseId,
      courseTitle: v.title,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalInPeriod: periodCountRes.count ?? 0,
    totalAllTime: allTimeCountRes.count ?? 0,
    byCourse,
    recent,
  };
}

// ─── Quizzes ──────────────────────────────────────────────────────

async function getQuizzesReport(
  period: ResolvedPeriod,
): Promise<QuizzesReport> {
  const admin = createAdminClient();

  const [periodAttemptsRes, quizzesRes, allAttemptsRes] = await checkedAll([
    admin
      .from('quiz_attempts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', period.from)
      .lt('created_at', period.to),
    paged(
      (from, to) =>
        admin
          .from('quizzes')
          .select('id, lesson_id, pass_threshold_percent', { count: 'exact' })
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
    paged(
      (from, to) =>
        admin
          .from('quiz_attempts')
          .select('id, quiz_id, user_id, score_percent, passed, created_at', { count: 'exact' })
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ),
  ]);

  const quizzes = quizzesRes.data ?? [];
  const attempts = allAttemptsRes.data ?? [];

  // Resolve lesson + course titles for every quiz in one pass.
  const lessonIds = Array.from(new Set(quizzes.map((q) => q.lesson_id)));
  const lessonRes = lessonIds.length
    ? await checked(pagedForIds(
      lessonIds,
      (ids, from, to) =>
        admin
          .from('lessons')
          .select('id, title, module_id', { count: 'exact' })
          .in('id', ids)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ))
    : { data: [] as Array<{ id: string; title: string; module_id: string }> };
  const moduleIds = Array.from(
    new Set((lessonRes.data ?? []).map((l) => l.module_id)),
  );
  const moduleRes = moduleIds.length
    ? await checked(pagedForIds(
      moduleIds,
      (ids, from, to) =>
        admin
          .from('modules')
          .select('id, course_id', { count: 'exact' })
          .in('id', ids)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ))
    : { data: [] as Array<{ id: string; course_id: string }> };
  const courseIds = Array.from(
    new Set((moduleRes.data ?? []).map((m) => m.course_id)),
  );
  const courseRes = courseIds.length
    ? await checked(pagedForIds(
      courseIds,
      (ids, from, to) =>
        admin
          .from('courses')
          .select('id, title', { count: 'exact' })
          .in('id', ids)
          .order('id', { ascending: true })
          .range(from, to),
      row => row.id,
    ))
    : { data: [] as Array<{ id: string; title: string }> };

  const moduleToCourseId = new Map<string, string>();
  for (const m of moduleRes.data ?? [])
    moduleToCourseId.set(m.id, m.course_id);
  const courseTitleById = new Map<string, string>();
  for (const c of courseRes.data ?? []) courseTitleById.set(c.id, c.title);
  const lessonInfoById = new Map<
    string,
    { title: string; courseTitle: string | null }
  >();
  for (const l of lessonRes.data ?? []) {
    const courseId = moduleToCourseId.get(l.module_id);
    lessonInfoById.set(l.id, {
      title: l.title,
      courseTitle: courseId ? courseTitleById.get(courseId) ?? null : null,
    });
  }

  // Aggregate attempts per quiz.
  const byQuiz = new Map<
    string,
    {
      attempts: number;
      students: Set<string>;
      passes: number;
      scoreSum: number;
      scoreCount: number;
      lastAt: string | null;
    }
  >();
  for (const a of attempts) {
    const cur = byQuiz.get(a.quiz_id) ?? {
      attempts: 0,
      students: new Set<string>(),
      passes: 0,
      scoreSum: 0,
      scoreCount: 0,
      lastAt: null,
    };
    cur.attempts += 1;
    cur.students.add(a.user_id);
    if (a.passed) cur.passes += 1;
    if (typeof a.score_percent === 'number') {
      cur.scoreSum += a.score_percent;
      cur.scoreCount += 1;
    }
    if (!cur.lastAt || a.created_at > cur.lastAt) cur.lastAt = a.created_at;
    byQuiz.set(a.quiz_id, cur);
  }

  const perQuiz: QuizStats[] = quizzes.map((q) => {
    const agg = byQuiz.get(q.id);
    const lessonInfo = lessonInfoById.get(q.lesson_id);
    const attemptsCount = agg?.attempts ?? 0;
    return {
      quizId: q.id,
      lessonTitle: lessonInfo?.title ?? null,
      courseTitle: lessonInfo?.courseTitle ?? null,
      passThresholdPercent: q.pass_threshold_percent,
      attempts: attemptsCount,
      uniqueStudents: agg?.students.size ?? 0,
      passes: agg?.passes ?? 0,
      passRatePercent:
        attemptsCount > 0
          ? Math.round((100 * (agg?.passes ?? 0)) / attemptsCount)
          : 0,
      avgScorePercent:
        agg && agg.scoreCount > 0
          ? Math.round(agg.scoreSum / agg.scoreCount)
          : null,
      lastAttemptAt: agg?.lastAt ?? null,
    };
  });
  // Sort: most-attempted first.
  perQuiz.sort((a, b) => b.attempts - a.attempts);

  return {
    totalAttemptsInPeriod: periodAttemptsRes.count ?? 0,
    totalQuizzes: quizzes.length,
    perQuiz,
  };
}

// ─── Users lifecycle ──────────────────────────────────────────────

async function getUsersLifecycleReport(now: Date): Promise<UsersLifecycleReport> {
  const admin = createAdminClient();

  // Buckets are mutually exclusive — `new` (joined recently) is checked
  // first and overrides the login-based ones, which matches what an admin
  // intuits from "new students this week" vs "active users".
  const nowMs = now.getTime();
  const SEVEN_D = new Date(nowMs - 7 * 86_400_000).toISOString();
  const THIRTY_D = new Date(nowMs - 30 * 86_400_000).toISOString();
  const NINETY_D = new Date(nowMs - 90 * 86_400_000).toISOString();

  const { data: rows } = await checked(paged(
    (from, to) =>
      admin
        .from('profiles')
        .select('id, created_at, last_login_at', { count: 'exact' })
        .in('role', STUDENT_ROLES)
        .order('id', { ascending: true })
        .range(from, to),
    row => row.id,
  ));

  const counts: Record<LifecycleSegment, number> = {
    new: 0,
    active: 0,
    engaged: 0,
    inactive: 0,
    dormant: 0,
    never: 0,
  };

  for (const r of rows ?? []) {
    if (r.created_at && r.created_at >= SEVEN_D) {
      counts.new += 1;
      continue;
    }
    if (!r.last_login_at) {
      counts.never += 1;
      continue;
    }
    if (r.last_login_at >= SEVEN_D) counts.active += 1;
    else if (r.last_login_at >= THIRTY_D) counts.engaged += 1;
    else if (r.last_login_at >= NINETY_D) counts.inactive += 1;
    else counts.dormant += 1;
  }

  const total = (rows ?? []).length;
  const order: LifecycleSegment[] = [
    'new',
    'active',
    'engaged',
    'inactive',
    'dormant',
    'never',
  ];
  const segments: LifecycleSegmentStat[] = order.map((segment) => ({
    segment,
    count: counts[segment],
    percent: total > 0 ? Math.round((100 * counts[segment]) / total) : 0,
  }));

  return { totalStudents: total, segments };
}

// ─── Email deliverability ─────────────────────────────────────────

const HARD_FAIL_EVENTS = new Set([
  'hard_bounce',
  'blocked',
  'invalid',
  'spam',
  'complaint',
]);
const SENT_EVENTS = new Set(['delivered', 'sent']);

async function getEmailReport(period: ResolvedPeriod): Promise<EmailReport> {
  const admin = createAdminClient();

  const [periodEventsRes, recentBouncesRes, recentActivityRes, anyEverRes] =
    await checkedAll([
      paged(
        (from, to) =>
          admin
            .from('email_events')
            .select('id, event_type, email, occurred_at', { count: 'exact' })
            .gte('occurred_at', period.from)
            .lt('occurred_at', period.to)
            .order('id', { ascending: true })
            .range(from, to),
        row => row.id,
      ),
      admin
        .from('email_events')
        .select('email, event_type, subject, occurred_at')
        .in('event_type', [
          'hard_bounce',
          'soft_bounce',
          'blocked',
          'invalid',
          'spam',
          'complaint',
        ])
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(50),
      admin
        .from('email_events')
        .select('email, event_type, subject, tag, occurred_at')
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(50),
      admin
        .from('email_events')
        .select('id', { count: 'exact', head: true }),
    ]);

  const periodRows = periodEventsRes.data ?? [];
  const totalSent = periodRows.filter((r) =>
    SENT_EVENTS.has(r.event_type),
  ).length;
  const totalBounced = periodRows.filter((r) =>
    ['hard_bounce', 'soft_bounce'].includes(r.event_type),
  ).length;
  const totalBlocked = periodRows.filter((r) =>
    ['blocked', 'invalid', 'spam', 'complaint'].includes(r.event_type),
  ).length;
  const denominator = totalSent + totalBounced + totalBlocked;
  const bounceRatePercent =
    denominator > 0
      ? Math.round((100 * (totalBounced + totalBlocked)) / denominator)
      : 0;

  const byEventTypeMap = new Map<string, number>();
  for (const r of periodRows) {
    byEventTypeMap.set(
      r.event_type,
      (byEventTypeMap.get(r.event_type) ?? 0) + 1,
    );
  }
  const byEventType: EmailEventCount[] = Array.from(byEventTypeMap.entries())
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count);

  const recentBounces: EmailBounceRow[] = (recentBouncesRes.data ?? []).map(
    (r) => ({
      email: r.email,
      eventType: r.event_type,
      subject: r.subject,
      occurredAt: r.occurred_at,
    }),
  );

  // This panel is a sample from the 50 recent bounces above, not a full
  // suppression registry. Soft bounces are excluded from the sample.
  const invalidSet = new Set<string>();
  for (const r of recentBouncesRes.data ?? []) {
    if (HARD_FAIL_EVENTS.has(r.event_type)) invalidSet.add(r.email);
  }

  const recentActivity: EmailActivityRow[] = (recentActivityRes.data ?? []).map(
    (r) => ({
      email: r.email,
      eventType: r.event_type,
      subject: r.subject,
      tag: r.tag,
      occurredAt: r.occurred_at,
    }),
  );

  return {
    configured: (anyEverRes.count ?? 0) > 0,
    totalSentInPeriod: totalSent,
    totalBouncedInPeriod: totalBounced,
    totalBlockedInPeriod: totalBlocked,
    bounceRatePercent,
    byEventType,
    recentBounces,
    recentActivity,
    invalidEmails: Array.from(invalidSet).slice(0, 100),
  };
}

export async function getReportsData(
  periodKey: ReportsPeriodKey = '30d',
  customRange?: { from?: string; to?: string },
  now: Date = new Date(),
): Promise<ReportsData> {
  await requireAdmin();
  const period = resolvePeriod(periodKey, customRange, now);

  const [
    kpis,
    accesses,
    courses,
    expiringSoon,
    recentEnrollments,
    topStudents,
    lessonDive,
    chatUsage,
    liveClassAttendance,
    pointsLeaderboard,
    certificates,
    quizzes,
    usersLifecycle,
    emails,
  ] = await checkedAll([
    getKpis(period),
    getAccessesBreakdown(now),
    getCoursesPerformance(),
    getExpiringSoon(now, 30),
    getRecentEnrollments(20),
    getTopStudents(period, 10),
    getLessonEngagement(period),
    getChatUsage(period),
    getLiveClassAttendance(period, now),
    getPointsLeaderboard(period, 10),
    getCertificatesReport(period),
    getQuizzesReport(period),
    getUsersLifecycleReport(now),
    getEmailReport(period),
  ]);

  return {
    period,
    kpis,
    accesses,
    courses,
    expiringSoon,
    recentEnrollments,
    topStudents,
    lessonDive,
    chatUsage,
    liveClassAttendance,
    pointsLeaderboard,
    certificates,
    quizzes,
    usersLifecycle,
    emails,
  };
}
