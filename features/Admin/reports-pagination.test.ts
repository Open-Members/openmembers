import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/core/access/admin', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { getReportsData, ReportReadError } from './reports-queries';

type Row = Record<string, unknown>;
type Read = {
  table: string;
  columns: string;
  head: boolean;
  exact: boolean;
  start: number;
  end: number;
  order: string[];
  inSizes: number[];
};
const NOW = new Date('2026-09-14T12:00:00.000Z');
const EVENT_AT = '2026-09-10T12:00:00.000Z';
const id = (prefix: string, index: number) => `${prefix}-${String(index).padStart(4, '0')}`;

/** A response cap simulator, not a database: filters, ordering, ranges and exact
 * counts are applied independently of the report's requested page size. */
function cappedClient(
  tables: Record<string, Row[]>,
  options: { cap?: number; fail?: (read: Read) => boolean; missingAuth?: string } = {},
) {
  const reads: Read[] = [];
  const from = vi.fn((table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    const orders: { column: string; ascending: boolean }[] = [];
    const inSizes: number[] = [];
    let columns = '';
    let head = false;
    let exact = false;
    let start = 0;
    let end = Number.MAX_SAFE_INTEGER;
    let limit = Number.MAX_SAFE_INTEGER;
    const query = {
      select(value: string, config?: { count?: string; head?: boolean }) {
        columns = value;
        head = config?.head ?? false;
        exact = config?.count === 'exact';
        return query;
      },
      in(column: string, values: readonly unknown[]) {
        inSizes.push(values.length);
        filters.push(row => values.includes(row[column]));
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push(row => row[column] === value);
        return query;
      },
      not(column: string, operation: string, value: unknown) {
        expect(operation).toBe('is');
        filters.push(row => row[column] !== value);
        return query;
      },
      gte(column: string, value: string) {
        filters.push(row => typeof row[column] === 'string' && row[column] >= value);
        return query;
      },
      lt(column: string, value: string) {
        filters.push(row => typeof row[column] === 'string' && row[column] < value);
        return query;
      },
      lte(column: string, value: string) {
        filters.push(row => typeof row[column] === 'string' && row[column] <= value);
        return query;
      },
      order(column: string, config?: { ascending?: boolean }) {
        orders.push({ column, ascending: config?.ascending ?? true });
        return query;
      },
      limit(value: number) {
        limit = value;
        return query;
      },
      range(first: number, last: number) {
        start = first;
        end = last;
        return query;
      },
      then(resolve: (result: { data: Row[] | null; count: number | null; error: unknown }) => unknown) {
        const read = { table, columns, head, exact, start, end, order: orders.map(order => order.column), inSizes };
        reads.push(read);
        if (options.fail?.(read)) {
          return Promise.resolve({ data: null, count: null, error: { message: 'PRIVATE page failure' } }).then(resolve);
        }
        const filtered = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
        filtered.sort((a, b) => {
          for (const { column, ascending } of orders) {
            const left = a[column] as string | number;
            const right = b[column] as string | number;
            if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        return Promise.resolve({
          data: head ? null : filtered.slice(start, Math.min(end + 1, start + limit, start + (options.cap ?? 1000))),
          count: exact ? filtered.length : null,
          error: null,
        }).then(resolve);
      },
    };
    return query;
  });
  const getUserById = vi.fn(async (userId: string) => options.missingAuth === userId
    ? { data: { user: null }, error: { message: 'PRIVATE auth failure' } }
    : { data: { user: { id: userId, email: `${userId}@example.test` } }, error: null });
  const listUsers = vi.fn(async () => ({
    data: { users: (tables.profiles ?? []).slice(0, 1000).map(row => ({ id: row.id, email: `${row.id}@example.test` })) },
    error: null,
  }));
  return { from, auth: { admin: { getUserById, listUsers } }, reads };
}

function profiles(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: id('user', index), role: 'user', display_name: `Student ${index}`,
    created_at: '2026-01-01T00:00:00.000Z', last_login_at: EVENT_AT,
  }));
}

function volumeFixture(): Record<string, Row[]> {
  const count = 1001;
  const rows = Array.from({ length: count }, (_, index) => index);
  const courseId = id('course', 0);
  const moduleId = id('module', 0);
  const lessonContext = { modules: { course_id: courseId } };
  const tables: Record<string, Row[]> = {
    profiles: profiles(count),
    courses: rows.map(index => ({ id: id('course', index), slug: `course-${index}`, title: `Course ${index}`, sort_order: 0, is_published: true })),
    modules: [{ id: moduleId, course_id: courseId }],
    lessons: rows.map(index => ({ id: id('lesson', index), title: `Lesson ${index}`, slug: `lesson-${index}`, module_id: moduleId, modules: { course_id: courseId, courses: { title: 'Course 0', slug: 'course-0' } } })),
    access_level_courses: rows.map(index => ({ access_level_id: id('level', index), course_id: courseId })),
    enrollments: rows.map(index => ({ id: id('enrollment', index), user_id: id('user', index), access_level_id: id('level', index), is_active: true, enrolled_at: EVENT_AT, expires_at: '2026-09-20T00:00:00.000Z', profiles: { display_name: `Student ${index}` }, access_levels: { name: `Level ${index}` } })),
    lesson_progress: rows.map(index => ({ id: id('progress', index), user_id: id('user', index), lesson_id: id('lesson', index), is_completed: true, completed_at: EVENT_AT, updated_at: EVENT_AT, lessons: lessonContext })),
    lesson_ratings: rows.map(index => ({ lesson_id: id('lesson', index), user_id: id('user', index), stars: index === 1000 ? 1 : 5, created_at: EVENT_AT, lessons: lessonContext })),
    chat_conversations: rows.map(index => ({ id: id('conversation', index), user_id: id('user', index), course_id: courseId, created_at: EVENT_AT, courses: { title: 'Course 0' } })),
    chat_messages: rows.map(index => ({ id: id('message', index), conversation_id: id('conversation', index), role: 'user', created_at: EVENT_AT, chat_conversations: { user_id: id('user', index) } })),
    live_classes: rows.map(index => ({ id: id('live', index), title: `Live ${index}`, starts_at: EVENT_AT, duration_minutes: 60, live_class_courses: [{ courses: { title: 'Course 0' } }] })),
    live_class_courses: rows.map(index => ({ live_class_id: id('live', 0), course_id: id('course', index), courses: { title: `Course ${index}` } })),
    live_class_clicks: rows.map(index => ({ id: id('click', index), live_class_id: id('live', 0), user_id: id('user', index), clicked_at: EVENT_AT })),
    certificates: rows.map(index => ({ id: id('certificate', index), course_id: id('course', index), user_id: id('user', index), verification_code: `certificate-${index}`, issued_at: EVENT_AT })),
    quizzes: rows.map(index => ({ id: id('quiz', index), lesson_id: id('lesson', index), pass_threshold_percent: 70 })),
    quiz_attempts: rows.map(index => ({ id: id('attempt', index), quiz_id: id('quiz', 1000), user_id: id('user', index), score_percent: 80, passed: true, created_at: EVENT_AT })),
    email_events: rows.map(index => ({ id: id('email', index), email: `${id('user', index)}@example.test`, event_type: index === 1000 ? 'hard_bounce' : 'sent', occurred_at: EVENT_AT, subject: 'Example', tag: null })),
  };
  // A winner emerges only after the first 1,000 progress rows have been read.
  tables.lesson_progress.push({ id: id('progress', 1001), user_id: id('user', 1000), lesson_id: id('lesson', 0), is_completed: true, completed_at: EVENT_AT, updated_at: EVENT_AT, lessons: lessonContext });
  return tables;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({});
});

describe('complete report inputs', () => {
  it('counts 1,001 student profiles and every lifecycle/access bucket', async () => {
    const client = cappedClient({ profiles: profiles(1001) });
    mocks.createAdminClient.mockReturnValue(client);
    const report = await getReportsData('30d', undefined, NOW);
    expect(report.kpis.totalStudents).toBe(1001);
    expect(report.accesses.total).toBe(1001);
    expect(report.accesses.twoToSeven).toBe(1001);
    expect(report.usersLifecycle.totalStudents).toBe(1001);
    expect(report.usersLifecycle.segments.find(segment => segment.segment === 'active')?.count).toBe(1001);
    expect(client.reads.filter(read => read.table === 'profiles' && !read.head && read.start === 1000)).toHaveLength(2);
  });

  it('uses later pages in rankings, joins and every aggregate while preserving recent panel limits', async () => {
    const client = cappedClient(volumeFixture());
    mocks.createAdminClient.mockReturnValue(client);
    const report = await getReportsData('30d', undefined, NOW);

    expect(report.kpis.totalRatings).toBe(1001);
    expect(report.courses).toHaveLength(1001);
    expect(report.courses[0]).toMatchObject({ totalAccess: 1001, withProgress: 1001, totalRatings: 1001 });
    expect(report.topStudents[0]).toMatchObject({ userId: 'user-1000', lessonsCompleted: 2, userEmail: 'user-1000@example.test' });
    expect(report.pointsLeaderboard.students[0]).toMatchObject({ userId: 'user-1000', totalPoints: 47, userEmail: 'user-1000@example.test' });
    expect(report.lessonDive.mostWatched[0]).toMatchObject({ lessonId: 'lesson-0000', started: 2 });
    expect(report.chatUsage).toMatchObject({ conversations: 1001, userMessages: 1001, uniqueUsers: 1001 });
    expect(report.liveClassAttendance.totalSessions).toBe(1001);
    expect(report.liveClassAttendance.past.find(row => row.liveClassId === 'live-0000')).toMatchObject({ totalClicks: 1001, clickedUsers: 1001 });
    expect(report.liveClassAttendance.past.find(row => row.liveClassId === 'live-0000')?.courseTitles).toHaveLength(1001);
    expect(report.certificates.totalAllTime).toBe(1001);
    expect(report.certificates.byCourse).toHaveLength(1001);
    expect(report.certificates.byCourse.find(row => row.courseId === 'course-1000')).toEqual({ courseId: 'course-1000', courseTitle: 'Course 1000', count: 1 });
    expect(report.quizzes.totalQuizzes).toBe(1001);
    expect(report.quizzes.perQuiz[0]).toMatchObject({ quizId: 'quiz-1000', lessonTitle: 'Lesson 1000', attempts: 1001, uniqueStudents: 1001, avgScorePercent: 80 });
    expect(report.emails).toMatchObject({ totalSentInPeriod: 1000, totalBouncedInPeriod: 1 });
    expect(report.expiringSoon).toHaveLength(100);
    expect(report.recentEnrollments).toHaveLength(20);
    expect(report.certificates.recent).toHaveLength(50);
    expect(report.emails.recentActivity).toHaveLength(50);
    expect(client.auth.admin.listUsers).not.toHaveBeenCalled();
    expect(client.reads.flatMap(read => read.inSizes).every(size => size <= 100)).toBe(true);
    const largeTables = ['courses', 'lessons', 'access_level_courses', 'enrollments', 'lesson_progress', 'lesson_ratings', 'chat_conversations', 'chat_messages', 'live_classes', 'live_class_courses', 'live_class_clicks', 'certificates', 'quizzes', 'quiz_attempts', 'email_events'];
    for (const table of largeTables) {
      expect(client.reads.some(read => read.table === table && read.start === 1000), table).toBe(true);
    }
    expect(client.reads.filter(read => read.table === 'lesson_ratings' && read.exact).every(read => read.order.join(',') === 'lesson_id,user_id')).toBe(true);
    expect(client.reads.filter(read => read.table === 'access_level_courses').every(read => read.order.join(',') === 'access_level_id,course_id')).toBe(true);
  });

  it('continues through short pages when an installation has a lower API cap', async () => {
    const client = cappedClient({ profiles: profiles(1001) }, { cap: 200 });
    mocks.createAdminClient.mockReturnValue(client);
    const report = await getReportsData('30d', undefined, NOW);
    expect(report.accesses.total).toBe(1001);
    expect(report.usersLifecycle.totalStudents).toBe(1001);
    expect(client.reads.some(read => read.table === 'profiles' && read.start === 1000)).toBe(true);
  });

  it('rejects the whole report on a failed later page instead of returning partial totals', async () => {
    const client = cappedClient({ profiles: profiles(1001) }, { fail: read => read.table === 'profiles' && !read.head && read.start > 0 });
    mocks.createAdminClient.mockReturnValue(client);
    await expect(getReportsData('30d', undefined, NOW)).rejects.toEqual(new ReportReadError());
  });

  it('rejects a failed later metadata chunk rather than omitting lessons from the ranking', async () => {
    let metadataChunks = 0;
    const client = cappedClient(volumeFixture(), { fail: read => read.table === 'lessons' && read.inSizes.length > 0 && read.start === 0 && read.columns.includes('slug') && ++metadataChunks > 1 });
    mocks.createAdminClient.mockReturnValue(client);
    await expect(getReportsData('30d', undefined, NOW)).rejects.toEqual(new ReportReadError());
  });

  it('does not hide a failed exact Auth lookup as an empty student email', async () => {
    const client = cappedClient(volumeFixture(), { missingAuth: 'user-1000' });
    mocks.createAdminClient.mockReturnValue(client);
    await expect(getReportsData('30d', undefined, NOW)).rejects.toEqual(new ReportReadError());
  });
});
