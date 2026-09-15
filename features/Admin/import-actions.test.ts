// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
  listUsers: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/core/access/admin', () => ({
  requireAdmin: mocks.requireAdmin,
  requireManageableUser: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { bulkImportStudents, previewBulkImport } from './actions';

const level = { id: 'level-1', slug: 'premium', name: 'Premium' };
const cohorts = [
  {
    id: 'cohort-1',
    slug: 'granted',
    name: 'Granted cohort',
    course_id: 'course-1',
  },
  {
    id: 'cohort-2',
    slug: 'blocked',
    name: 'Blocked cohort',
    course_id: 'course-2',
  },
];

function catalogueClient(tables: Record<string, Array<Record<string, unknown>>>, failFrom?: number) {
  return (table: string) => {
    let start = 0;
    let end = 999;
    const rows = tables[table] ?? [];
    const query = {
      select: () => query,
      order: () => query,
      range: (from: number, to: number) => { start = from; end = to; return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: rows.slice(start, end + 1),
        count: rows.length,
        error: failFrom !== undefined && start >= failFrom ? { message: 'private catalogue diagnostic' } : null,
      }).then(resolve),
    };
    return query;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listUsers.mockResolvedValue({
    data: { users: [{ email: 'existing@example.test' }] },
    error: null,
  });
  mocks.rpc.mockImplementation(async (_name: string, { p_email }: { p_email: string }) => ({
    data: p_email === 'existing@example.test' ? 'existing-id' : null,
    error: null,
  }));
  mocks.from.mockImplementation(catalogueClient({
    access_levels: [level],
    cohorts,
    access_level_courses: [{ access_level_id: level.id, course_id: 'course-1' }],
  }));
  mocks.requireAdmin.mockResolvedValue({
    adminClient: {
      from: mocks.from,
      rpc: mocks.rpc,
      auth: { admin: { listUsers: mocks.listUsers } },
    },
  });
});

describe('bulk student import boundary', () => {
  it('returns only stable reason codes and serializable parameters', async () => {
    const preview = await previewBulkImport([
      { email: '', name: 'Empty', access_level_slug: 'premium' },
      { email: 'invalid', name: 'Invalid', access_level_slug: 'premium' },
      { email: 'name@example.test', name: '', access_level_slug: 'premium' },
      { email: 'level@example.test', name: 'Level', access_level_slug: '' },
      { email: 'unknown@example.test', name: 'Unknown', access_level_slug: 'vip' },
      {
        email: 'date@example.test',
        name: 'Date',
        access_level_slug: 'premium',
        expiration_date: 'not-a-date',
      },
      {
        email: 'cohort@example.test',
        name: 'Cohort',
        access_level_slug: 'premium',
        cohort_slug: 'missing',
      },
      {
        email: 'blocked@example.test',
        name: 'Blocked',
        access_level_slug: 'premium',
        cohort_slug: 'blocked',
      },
      {
        email: 'existing@example.test',
        name: 'Existing',
        access_level_slug: 'premium',
        cohort_slug: 'granted',
      },
    ]);

    expect(preview.map(({ status, reasonCode, reasonValues }) => ({
      status,
      reasonCode,
      reasonValues,
    }))).toEqual([
      { status: 'error', reasonCode: 'emailRequired', reasonValues: undefined },
      { status: 'error', reasonCode: 'invalidEmail', reasonValues: undefined },
      { status: 'error', reasonCode: 'nameRequired', reasonValues: undefined },
      { status: 'error', reasonCode: 'accessLevelRequired', reasonValues: undefined },
      { status: 'error', reasonCode: 'unknownAccessLevel', reasonValues: { slug: 'vip' } },
      { status: 'error', reasonCode: 'invalidExpiration', reasonValues: undefined },
      { status: 'error', reasonCode: 'unknownCohort', reasonValues: { slug: 'missing' } },
      {
        status: 'error',
        reasonCode: 'cohortNotGranted',
        reasonValues: { cohort: 'blocked', level: 'premium' },
      },
      { status: 'existing', reasonCode: null, reasonValues: undefined },
    ]);
    expect(preview.every((row) => !Object.hasOwn(row, 'reason'))).toBe(true);
    expect(JSON.parse(JSON.stringify(preview))).toHaveLength(preview.length);
  });

  it('keeps an empty email empty and excludes prose from the import summary', async () => {
    const summary = await bulkImportStudents(
      [{ email: '', name: 'Empty', access_level_slug: 'premium' }],
      { defaultSendWelcomeEmail: true },
    );

    expect(summary).toMatchObject({
      totalRows: 1,
      skippedErrors: 1,
      errors: [{ rowIndex: 2, email: '', reasonCode: 'emailRequired' }],
    });
    expect(Object.hasOwn(summary.errors[0], 'reason')).toBe(false);
    expect(JSON.stringify(summary)).not.toContain('(blank)');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/users');
  });

  it('fails with a stable code when a required preview read fails', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'private provider diagnostic' },
    });

    await expect(
      previewBulkImport([
        { email: 'learner@example.test', name: 'Learner', access_level_slug: 'premium' },
      ]),
    ).rejects.toThrow('importUnavailable');
  });

  it('finds existing accounts after the first 1000 without listing unrelated users', async () => {
    mocks.rpc.mockResolvedValue({ data: 'account-1001', error: null });
    const preview = await previewBulkImport([
      { email: '  LEARNER1001@example.test ', name: 'Learner', access_level_slug: 'premium' },
      { email: 'learner1001@example.test', name: 'Same learner', access_level_slug: 'premium' },
    ]);
    expect(preview.map(({ userExists, status }) => ({ userExists, status }))).toEqual([
      { userExists: true, status: 'existing' },
      { userExists: true, status: 'existing' },
    ]);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('get_user_id_by_email', { p_email: 'learner1001@example.test' });
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it('resolves levels, cohorts and grants after 1000 catalogue rows', async () => {
    const catalogue = Array.from({ length: 1001 }, (_, index) => ({
      id: `row-${String(index + 1).padStart(4, '0')}`, slug: `slug-${index + 1}`, name: `Fictitious ${index + 1}`,
    }));
    mocks.from.mockImplementation(catalogueClient({
      access_levels: catalogue,
      cohorts: catalogue.map((row) => ({ ...row, course_id: row.id })),
      access_level_courses: catalogue.map((row) => ({ access_level_id: row.id, course_id: row.id })),
    }));
    await expect(previewBulkImport([
      { email: 'learner@example.test', name: 'Learner', access_level_slug: 'slug-1001', cohort_slug: 'slug-1001' },
    ])).resolves.toMatchObject([{ status: 'valid', resolved: { accessLevelId: 'row-1001', cohortId: 'row-1001' } }]);
  });

  it('fails closed when a later catalogue page cannot be read', async () => {
    mocks.from.mockImplementation(catalogueClient({
      access_levels: Array.from({ length: 1001 }, (_, index) => ({ id: `level-${index}`, slug: `level-${index}`, name: 'Fictitious' })),
    }, 500));
    await expect(previewBulkImport([
      { email: 'learner@example.test', name: 'Learner', access_level_slug: 'level-1000' },
    ])).rejects.toThrow('importUnavailable');
  });

  it('bounds exact lookup concurrency for a file with more than 1000 distinct emails', async () => {
    let active = 0;
    let maximum = 0;
    mocks.rpc.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return { data: null, error: null };
    });
    const preview = await previewBulkImport(Array.from({ length: 1001 }, (_, index) => ({
      email: `learner${index}@example.test`, name: 'Learner', access_level_slug: 'premium',
    })));
    expect(preview).toHaveLength(1001);
    expect(preview.every((row) => row.status === 'valid')).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(1001);
    expect(maximum).toBeLessThanOrEqual(5);
  });

  it('authorizes before reading catalogues or account matches', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    await expect(previewBulkImport([])).rejects.toThrow('Forbidden');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
