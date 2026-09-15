// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  caller: vi.fn(),
  profiles: vi.fn(),
  listUsers: vi.fn(),
  enrollments: vi.fn(),
  rateLimit: vi.fn(),
  queries: vi.fn(),
}));

vi.mock('@/core/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.caller }) }),
    }),
  }),
}));
vi.mock('@/core/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { listUsers: mocks.listUsers } },
    from: (table: string) => {
      let from = 0;
      let to = 999;
      let exact = false;
      const orders: string[] = [];
      async function read() {
        mocks.queries({ table, from, to, exact, orders });
        const result = await (table === 'profiles' ? mocks.profiles : mocks.enrollments)();
        if (result.error || !result.data) return result;
        return { ...result, data: result.data.slice(from, Math.min(to + 1, from + 1000)),
          count: exact ? (result.count ?? result.data.length) : null };
      }
      const query = {
        select: (_columns: string, options?: { count?: string }) => { exact = options?.count === 'exact'; return query; },
        order: (column: string) => { orders.push(column); return query; },
        eq: () => query,
        limit: (limit: number) => { to = limit - 1; return query; },
        range: (start: number, end: number) => { from = start; to = end; return query; },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => read().then(resolve, reject),
      };
      return query;
    },
  }),
}));
vi.mock('@/core/rate-limit', () => ({ rateLimit: mocks.rateLimit }));

import { GET } from './route';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-13T12:00:00.000Z'));
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'admin-id' } },
    error: null,
  });
  mocks.caller.mockResolvedValue({
    data: { role: 'admin', status: 'active' },
    error: null,
  });
  mocks.rateLimit.mockReturnValue({ success: true });
  mocks.profiles.mockResolvedValue({
    data: [
      {
        id: 'student-id',
        display_name: 'João, "Autoral"',
        role: 'user',
        status: 'active',
        created_at: '2026-09-01T03:00:00.000Z',
      },
    ],
    error: null,
  });
  mocks.listUsers.mockResolvedValue({
    data: {
      users: [
        {
          id: 'student-id',
          email: 'joao@example.test',
          last_sign_in_at: '2026-09-12T22:00:00.000Z',
          email_confirmed_at: '2026-09-01T03:05:00.000Z',
        },
      ],
    },
    error: null,
  });
  mocks.enrollments.mockResolvedValue({
    data: [{ id: 'enrollment-a', user_id: 'student-id' }, { id: 'enrollment-b', user_id: 'student-id' }],
    error: null,
  });
});

afterEach(() => vi.useRealTimers());

describe('users export API', () => {
  it('preserves the technical CSV contract and authored values', async () => {
    const response = await GET();
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="users-2026-09-13.csv"',
    );
    expect(csv.split('\n')[0]).toBe(
      'email,display_name,role,status,created_at,last_sign_in_at,email_confirmed_at,active_enrollments_count',
    );
    expect(csv).toContain('joao@example.test,"João, ""Autoral""",user,active');
    expect(csv).toContain('2026-09-01T03:00:00.000Z');
    expect(csv).toContain('2026-09-12T22:00:00.000Z');
    expect(csv).toContain('2026-09-01T03:05:00.000Z,2');
  });

  it('neutralizes spreadsheet formulas in user-controlled profile text', async () => {
    mocks.profiles.mockResolvedValue({
      data: [
        {
          id: 'student-id',
          display_name: '@SUM(1+1)',
          role: 'user',
          status: 'active',
          created_at: '2026-09-01T03:00:00.000Z',
        },
      ],
      error: null,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("joao@example.test,'@SUM(1+1),user");
  });

  it('distinguishes a missing session from an unavailable auth provider', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    let response = await GET();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'unauthenticated' });

    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'PRIVATE auth details' },
    });
    response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'users_export_failed',
    });
    expect(mocks.caller).not.toHaveBeenCalled();
  });

  it.each([
    [{ data: { role: 'user', status: 'active' }, error: null }, 403, 'access_denied'],
    [{ data: { role: 'admin', status: 'suspended' }, error: null }, 403, 'access_denied'],
    [{ data: null, error: { message: 'PRIVATE profile details' } }, 503, 'users_export_failed'],
  ] as const)('requires an active administrator profile', async (caller, status, code) => {
    mocks.caller.mockResolvedValue(caller);
    const response = await GET();
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: code });
    expect(mocks.profiles).not.toHaveBeenCalled();
  });

  it('returns a stable rate-limit code and retry header', async () => {
    mocks.rateLimit.mockReturnValue({ success: false });
    const response = await GET();
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('3600');
    await expect(response.json()).resolves.toEqual({ error: 'rate_limited' });
    expect(mocks.profiles).not.toHaveBeenCalled();
  });

  it.each(['profiles', 'auth users', 'enrollments'] as const)(
    'fails the whole export when the %s read fails',
    async (source) => {
      if (source === 'profiles') {
        mocks.profiles.mockResolvedValue({
          data: null,
          error: { message: 'PRIVATE profile list details' },
        });
      } else if (source === 'auth users') {
        mocks.listUsers.mockResolvedValue({
          data: null,
          error: { message: 'PRIVATE auth list details' },
        });
      } else {
        mocks.enrollments.mockResolvedValue({
          data: null,
          error: { message: 'PRIVATE enrollment details' },
        });
      }

      const response = await GET();
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: 'users_export_failed',
      });
    },
  );

  it('exports all 1,203 profiles and enrollments with stable order beyond the API cap', async () => {
    const profiles = Array.from({ length: 1203 }, (_, i) => ({
      id: `student-${String(i).padStart(4, '0')}`, display_name: `Student ${i}`,
      role: 'user', status: 'active', created_at: '2026-09-01T03:00:00.000Z',
    }));
    mocks.profiles.mockResolvedValue({ data: profiles, error: null });
    mocks.enrollments.mockResolvedValue({ data: profiles.map((profile, i) => ({
      id: `enrollment-${i}`, user_id: profiles[1202].id,
    })), error: null });
    mocks.listUsers.mockImplementation(async ({ page, perPage }: { page: number; perPage: number }) => ({
      data: { users: profiles.slice((page - 1) * perPage, page * perPage)
        .map(profile => ({ id: profile.id, email: `${profile.id}@example.test` })), total: profiles.length },
      error: null,
    }));
    const response = await GET();
    expect(response.status).toBe(200);
    const lines = (await response.text()).trimEnd().split('\n');
    expect(lines).toHaveLength(1204);
    expect(lines.at(-1)).toContain('student-1202@example.test');
    expect(lines.at(-1)?.endsWith(',1203')).toBe(true);
    for (const [query] of mocks.queries.mock.calls) {
      expect(query.exact).toBe(true);
      expect(query.orders).toContain('id');
    }
  });

  it.each(['profiles', 'enrollments'] as const)('does not return a partial CSV after a later %s page fails', async table => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ id: `row-${i}`, user_id: 'student-id' }));
    mocks[table].mockResolvedValueOnce({ data: rows, error: null })
      .mockResolvedValue({ data: null, error: { message: 'fictitious second page failed' } });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('content-disposition')).toBeNull();
    expect(await response.json()).toEqual({ error: 'users_export_failed' });
  });

  it('refuses an export if a profile has no matching Auth account', async () => {
    mocks.listUsers.mockResolvedValue({ data: { users: [], total: 0 }, error: null });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'users_export_failed' });
  });
});
