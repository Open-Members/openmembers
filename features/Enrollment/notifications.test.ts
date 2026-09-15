// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), create: vi.fn() }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/core/notifications/service', () => ({ createNotification: mocks.create }));

import { notifyEnrollment } from './notifications';

function query(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue({ id: 'notification' });
});
it('persists a neutral enrollment descriptor and an English fallback through the service', async () => {
  mocks.admin.mockReturnValue({ from: (table: string) => query({
    data: table === 'access_levels'
      ? { name: 'Plano Ouro' }
      : [{ course: { title: 'Curso Principal', slug: 'principal' } }],
    error: null,
  }) });
  await notifyEnrollment({ userId: 'user', accessLevelId: 'level' });
  expect(mocks.create).toHaveBeenCalledWith({
    userId: 'user',
    type: 'enrollment',
    descriptor: {
      key: 'enrollment.singleCourse',
      params: { levelName: 'Plano Ouro', courseTitle: 'Curso Principal' },
    },
    actionUrl: '/courses/principal',
  });
});

it('does not interpret a failed context read as an empty membership', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.admin.mockReturnValue({ from: (table: string) => query({
    data: table === 'access_levels' ? { name: 'Plan' } : null,
    error: table === 'access_level_courses' ? { message: 'PRIVATE' } : null,
  }) });
  await expect(notifyEnrollment({ userId: 'user', accessLevelId: 'level' })).resolves.toBeUndefined();
  expect(mocks.create).not.toHaveBeenCalled();
});
