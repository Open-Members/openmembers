import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), admin: vi.fn(), access: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/core/access/server', () => ({ getUserCourseAccess: mocks.access }));
import { findUpcomingLiveClassForUser, listLiveClassesForUser } from './queries.server';

const now = new Date('2026-09-11T12:00:00Z');
const allowedCourse = { id: 'allowed-course', title: 'Demo course', slug: 'demo' };
const deniedCourse = { id: 'denied-course', title: 'Hidden course', slug: 'hidden' };
const event = {
  id: 'demo-event', title: 'Demo session', description: null,
  starts_at: now.toISOString(), duration_minutes: 60, meeting_url: 'https://example.org/meeting',
  origin_timezone: 'UTC', created_at: now.toISOString(), updated_at: now.toISOString(),
  live_class_courses: [{ courses: allowedCourse }, { courses: deniedCourse }],
};

function sessionRows(rows: unknown[], error: unknown = null) {
  const builder = {
    select: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve),
  };
  const from = vi.fn().mockReturnValue(builder);
  mocks.createClient.mockResolvedValue({ from });
  return { builder, from };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(new Set(['allowed-course']));
  mocks.admin.mockImplementation(() => { throw new Error('Student queries must not use service role'); });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

for (const [name, load] of [
  ['banner', async () => {
    const value = await findUpcomingLiveClassForUser('session-user', { now });
    return value ? [value] : [];
  }],
  ['calendar', () => listLiveClassesForUser('session-user', {
    fromIso: now.toISOString(), toIso: '2026-09-12T12:00:00Z',
  })],
] as const) {
  describe(`${name} student live sessions`, () => {
    it('does not load URLs when the session has no accessible courses', async () => {
      mocks.access.mockResolvedValue(new Set());
      expect(await load()).toEqual([]);
      expect(mocks.access).toHaveBeenCalledExactlyOnceWith('session-user');
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    });

    it('queries events with the session and limits both events and course badges', async () => {
      const { builder, from } = sessionRows([event, { ...event, id: 'blocked-event', live_class_courses: [{ courses: deniedCourse }] }]);
      const result = await load();
      expect(result).toHaveLength(1);
      expect(result[0].meetingUrl).toBe('https://example.org/meeting');
      expect(result[0].courses).toEqual([allowedCourse]);
      expect(from).toHaveBeenCalledExactlyOnceWith('live_classes');
      expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('live_class_courses!inner'));
      expect(builder.in).toHaveBeenCalledExactlyOnceWith('live_class_courses.course_id', ['allowed-course']);
      expect(mocks.admin).not.toHaveBeenCalled();
    });

    it('does not return partial event data after a database error', async () => {
      sessionRows([event], new Error('Database unavailable'));
      await expect(load()).rejects.toThrow('Database unavailable');
      expect(mocks.admin).not.toHaveBeenCalled();
    });
  });
}
