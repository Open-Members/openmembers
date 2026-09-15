import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), createAdminClient: vi.fn(), courseAccess: vi.fn(), lessonAccess: vi.fn(),
}));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/core/access/server', () => ({
  isUserCourseAccessible: mocks.courseAccess, isUserLessonAccessible: mocks.lessonAccess,
}));
import { calculateUnlockDate, getUnlockDates, isContentUnlocked } from './queries';

type Row = Record<string, unknown>;
function makeClient(tables: Record<string, Row | Row[] | null>, userId = 'user-1') {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) },
    from: (table: string) => {
      const rows = tables[table] ?? null;
      const builder = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
        maybeSingle: async () => ({ data: Array.isArray(rows) ? rows[0] : rows, error: null }),
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: Array.isArray(rows) ? rows : rows ? [rows] : [], error: null }),
      };
      return builder;
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lessonAccess.mockResolvedValue(false);
  mocks.courseAccess.mockResolvedValue(false);
});

describe('drip authorization', () => {
  it('passes both allowed and denied decisions through the common lesson gate', async () => {
    expect(await isContentUnlocked('user-1', 'lesson-1')).toEqual({ unlocked: false });
    mocks.lessonAccess.mockResolvedValue(true);
    expect(await isContentUnlocked('user-1', 'lesson-1')).toEqual({ unlocked: true });
    expect(mocks.lessonAccess).toHaveBeenCalledWith('user-1', 'lesson-1');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('does not load privileged metadata for another user or a suspended profile', async () => {
    mocks.createClient.mockResolvedValue(makeClient({}, 'another-user'));
    expect(await getUnlockDates('user-1', 'course-1')).toEqual(new Map());
    mocks.createClient.mockResolvedValue(makeClient({ profiles: { role: 'admin', status: 'suspended' } }));
    expect(await getUnlockDates('user-1', 'course-1')).toEqual(new Map());
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('uses per-lesson decisions even when the course gate is denied (free preview)', async () => {
    mocks.createClient.mockResolvedValue(makeClient({ profiles: { role: 'user', status: 'active' } }));
    mocks.createAdminClient.mockReturnValue(makeClient({
      courses: { id: 'course-1', is_published: true, is_coming_soon: false },
      modules: [{ id: 'module-1' }],
      lessons: [{ id: 'preview', module_id: 'module-1' }, { id: 'paid', module_id: 'module-1' }],
    }));
    mocks.lessonAccess.mockImplementation(async (_userId: string, lessonId: string) => lessonId === 'preview');
    const result = await getUnlockDates('user-1', 'course-1');
    expect(result.get('preview')).toEqual({ unlocked: true });
    expect(result.get('paid')).toEqual({ unlocked: false });
  });

  it('never turns an elapsed display date into permission', async () => {
    mocks.createClient.mockResolvedValue(makeClient({
      profiles: { role: 'user', status: 'active' }, enrollments: [{ access_level_id: 'level-1', enrolled_at: '2020-01-01T00:00:00Z' }],
    }));
    mocks.createAdminClient.mockReturnValue(makeClient({
      courses: { id: 'course-1', is_published: true, is_coming_soon: false }, modules: [{ id: 'module-1' }],
      lessons: [{ id: 'lesson-1', module_id: 'module-1' }], access_level_courses: [{ access_level_id: 'level-1' }],
      drip_rules: [{ lesson_id: null, module_id: null, rule_type: 'days_after_enrollment', days_after: 1, fixed_date: null }],
    }));
    mocks.courseAccess.mockResolvedValue(true);
    const result = await getUnlockDates('user-1', 'course-1');
    expect(result.get('lesson-1')).toEqual({ unlocked: false, unlocksAt: new Date('2020-01-02T00:00:00Z') });
  });

  it('returns no permissions when connection setup fails', async () => {
    mocks.createClient.mockRejectedValue(new Error('unavailable'));
    expect(await getUnlockDates('user-1', 'course-1')).toEqual(new Map());
  });
});

describe('informational release dates', () => {
  const base = { lesson_id: null, module_id: null, fixed_date: null, days_after: null };
  it('adds elapsed days in UTC across daylight saving boundaries', () => {
    const date = calculateUnlockDate({ ...base, rule_type: 'days_after_enrollment', days_after: 2 }, new Date('2026-03-07T12:00:00Z'));
    expect(date?.toISOString()).toBe('2026-03-09T12:00:00.000Z');
  });
  it('preserves the instant of a fixed release', () => {
    expect(calculateUnlockDate({ ...base, rule_type: 'fixed_date', fixed_date: '2026-09-11T10:00:00-03:00' }, null)?.toISOString()).toBe('2026-09-11T13:00:00.000Z');
  });
  it('omits dates for missing enrollment, invalid values and unknown rules', () => {
    expect(calculateUnlockDate({ ...base, rule_type: 'days_after_enrollment', days_after: 3 }, null)).toBeUndefined();
    expect(calculateUnlockDate({ ...base, rule_type: 'days_after_enrollment', days_after: -1 }, new Date())).toBeUndefined();
    expect(calculateUnlockDate({ ...base, rule_type: 'days_after_enrollment', days_after: Infinity }, new Date())).toBeUndefined();
    expect(calculateUnlockDate({ ...base, rule_type: 'fixed_date', fixed_date: 'invalid' }, null)).toBeUndefined();
    expect(calculateUnlockDate({ ...base, rule_type: 'unknown' }, null)).toBeUndefined();
  });
});
