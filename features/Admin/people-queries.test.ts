// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock('@/core/access/admin', () => ({
  requireAdmin: mocks.requireAdmin,
  requireManageableUser: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  getAdminAccessLevels,
  getAdminCourses,
  getAdminEnrollments,
  getAdminKPIs,
  getRecentEnrollments,
  searchUserByEmail,
} from './actions';
import { AdminOverviewReadError } from './errors';

type Row = Record<string, unknown>;

function database(tables: Record<string, Row[]>, failTable?: string, failFrom = 0) {
  return vi.fn((table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let from = 0;
    let to = 999;
    let head = false;
    const result = () => {
      const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      rows.sort((a, b) => {
        for (const { column, ascending } of orders) {
          const comparison = String(a[column]).localeCompare(String(b[column]));
          if (comparison) return ascending ? comparison : -comparison;
        }
        return 0;
      });
      return {
        data: head ? null : rows.slice(from, Math.min(to + 1, from + 1000)),
        count: rows.length,
        error: table === failTable && from >= failFrom ? { message: 'private database diagnostic' } : null,
      };
    };
    const query = {
      select: (_columns?: string, options?: { head?: boolean }) => {
        head = options?.head ?? false;
        return query;
      },
      in: (column: string, values: readonly unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return query;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      gte: (column: string, value: string) => {
        filters.push((row) => String(row[column]) >= value);
        return query;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        orders.push({ column, ascending: options?.ascending ?? true });
        return query;
      },
      limit: (limit: number) => { to = limit - 1; return query; },
      range: (start: number, end: number) => { from = start; to = end; return query; },
      single: async () => {
        const response = result();
        return { ...response, data: response.data?.[0] ?? null };
      },
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  });
}

const users = Array.from({ length: 1001 }, (_, index) => ({
  id: `user-${String(index + 1).padStart(4, '0')}`,
  email: `learner${index + 1}@example.test`,
}));
const lastUser = users[1000];

function setup(tables: Record<string, Row[]> = {}, failTable?: string, failFrom = 0) {
  const from = database({
    profiles: users.map((user) => ({ id: user.id, display_name: user.email, role: 'user' })),
    ...tables,
  }, failTable, failFrom);
  const listUsers = vi.fn().mockResolvedValue({ data: { users: users.slice(0, 1000) }, error: null });
  const getUserById = vi.fn(async (id: string) => ({ data: { user: users.find((user) => user.id === id) ?? null }, error: null }));
  const rpc = vi.fn(async (_name: string, args: { p_email: string }) => ({
    data: users.find((user) => user.email.toLowerCase() === args.p_email.toLowerCase())?.id ?? null,
    error: null,
  }));
  const client = { from, rpc, auth: { admin: { listUsers, getUserById } } };
  mocks.requireAdmin.mockResolvedValue({ supabase: client, adminClient: client });
  return { from, listUsers, getUserById, rpc };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('External requests are forbidden'); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('administrative people reads', () => {
  it('counts student profiles once, independently of enrollment and status', async () => {
    setup({
      profiles: [
        { id: 'two-courses', role: 'user', status: 'active' },
        { id: 'no-enrollment', role: 'user', status: 'active' },
        { id: 'expired', role: 'user', status: 'active' },
        { id: 'suspended', role: 'user', status: 'suspended' },
        { id: 'admin', role: 'admin', status: 'active' },
        { id: 'super-admin', role: 'super_admin', status: 'active' },
      ],
      enrollments: [
        { id: 'one', user_id: 'two-courses', is_active: true },
        { id: 'two', user_id: 'two-courses', is_active: true },
        { id: 'three', user_id: 'expired', is_active: true, expires_at: '2000-01-01' },
        { id: 'four', user_id: 'suspended', is_active: false },
      ],
    });
    expect((await getAdminKPIs()).totalStudents).toBe(4);
  });

  it('uses an exact count beyond the API row cap', async () => {
    setup();
    expect((await getAdminKPIs()).totalStudents).toBe(1001);
  });

  it('preserves the reports compatibility rule for a legacy student role', async () => {
    // The current SQL schema creates `user`; this simulates older installations.
    setup({ profiles: [{ id: 'legacy', role: 'student' }, { id: 'current', role: 'user' }] });
    expect((await getAdminKPIs()).totalStudents).toBe(2);
  });

  it('fails instead of reporting zero when student profiles cannot be counted', async () => {
    setup({}, 'profiles');
    await expect(getAdminKPIs()).rejects.toBeInstanceOf(AdminOverviewReadError);
  });

  it('finds an exact normalized email after the first 1000 accounts', async () => {
    const client = setup();
    await expect(searchUserByEmail(`  ${lastUser.email.toUpperCase()}  `)).resolves.toEqual({
      ...lastUser, displayName: lastUser.email,
    });
    expect(client.rpc).toHaveBeenCalledWith('get_user_id_by_email', { p_email: lastUser.email });
    expect(client.listUsers).not.toHaveBeenCalled();
  });

  it('returns null only for an absent email and avoids the account API', async () => {
    const client = setup();
    await expect(searchUserByEmail('missing@example.test')).resolves.toBeNull();
    expect(client.getUserById).not.toHaveBeenCalled();
  });

  it('does not disguise an exact lookup failure as a missing account', async () => {
    const client = setup();
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private lookup diagnostic' } } as never);
    await expect(searchUserByEmail(lastUser.email)).rejects.toThrow('loadFailed');
    expect(client.getUserById).not.toHaveBeenCalled();
  });

  it('rejects an unreadable account instead of returning a partial user', async () => {
    const client = setup();
    client.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'private auth diagnostic' } } as never);
    await expect(searchUserByEmail(lastUser.email)).rejects.toThrow('loadFailed');
  });

  it.each([getRecentEnrollments, getAdminEnrollments])('resolves only the accounts referenced by the displayed enrollments (%#)', async (read) => {
    const client = setup({ enrollments: [
      { id: 'enrollment-1', user_id: lastUser.id, enrolled_at: '2026-09-14', is_active: true, access_level_id: 'level-1' },
      { id: 'enrollment-2', user_id: lastUser.id, enrolled_at: '2026-09-13', is_active: true, access_level_id: 'level-2' },
    ] });
    const enrollments = await read();
    expect(enrollments.map((enrollment) => enrollment.userEmail)).toEqual([lastUser.email, lastUser.email]);
    expect(client.getUserById).toHaveBeenCalledExactlyOnceWith(lastUser.id);
    expect(client.listUsers).not.toHaveBeenCalled();
  });

  it.each([getAdminKPIs, getRecentEnrollments, getAdminEnrollments, getAdminCourses, getAdminAccessLevels, () => searchUserByEmail(lastUser.email)])('authorizes before every sensitive read (%#)', async (read) => {
    const client = setup();
    mocks.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    await expect(read()).rejects.toThrow('Forbidden');
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.getUserById).not.toHaveBeenCalled();
  });
});

describe('administrative catalogue aggregates', () => {
  const many = (field: string) => Array.from({ length: 1001 }, (_, index) => ({ id: `${field}-${String(index).padStart(4, '0')}` }));
  function catalogue() {
    return {
      courses: [{ id: 'course-1', title: 'Fictitious course' }],
      access_levels: [{ id: 'level-1', name: 'Fictitious access' }],
      access_level_courses: [{ access_level_id: 'level-1', course_id: 'course-1' }],
      modules: many('module').map((module) => ({ ...module, course_id: 'course-1' })),
      lessons: many('lesson').map((lesson) => ({ ...lesson, module_id: 'module-0000' })),
      enrollments: many('enrollment').map((enrollment) => ({ ...enrollment, access_level_id: 'level-1', is_active: true })),
    };
  }

  it('counts all modules, lessons and enrollments past 1000 rows', async () => {
    setup(catalogue());
    expect(await getAdminCourses()).toMatchObject([{ moduleCount: 1001, lessonCount: 1001, enrollmentCount: 1001 }]);
  });

  it('counts all enrollments for each access level past 1000 rows', async () => {
    setup(catalogue());
    expect(await getAdminAccessLevels()).toMatchObject([{ enrollmentCount: 1001, courseNames: ['Fictitious course'] }]);
  });

  it.each([getAdminCourses, getAdminAccessLevels])('rejects a later enrollment page failure rather than returning partial counts (%#)', async (read) => {
    setup(catalogue(), 'enrollments', 500);
    await expect(read()).rejects.toThrow('loadFailed');
  });
});
