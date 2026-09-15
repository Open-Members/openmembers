// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), createMany: vi.fn() }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/core/notifications/service', () => ({ createNotifications: mocks.createMany }));

import { notifyCoursePublished } from './content-events';

type Result = { data: unknown; error: unknown };
function query(result: Result) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'or', 'order']) builder[method] = vi.fn(() => builder);
  builder.range = vi.fn().mockResolvedValue(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createMany.mockResolvedValue({ inserted: 1, targeted: 1 });
});

it('targets only active unexpired access and emits a typed course descriptor', async () => {
  const builders: Record<string, Array<Record<string, unknown>>> = {};
  mocks.admin.mockReturnValue({ from: (table: string) => {
    const result: Result = table === 'courses'
      ? { data: { title: 'Curso Novo', slug: 'curso-novo' }, error: null }
      : table === 'access_level_courses'
        ? { data: [{ access_level_id: 'level' }], error: null }
        : { data: [{ user_id: 'user' }, { user_id: 'user' }], error: null };
    const builder = query(result);
    (builders[table] ??= []).push(builder);
    return builder;
  } });

  await notifyCoursePublished({ courseId: 'course' });
  expect(mocks.createMany).toHaveBeenCalledWith({
    userIds: ['user'],
    type: 'new_course',
    descriptor: { key: 'content.coursePublished', params: { courseTitle: 'Curso Novo' } },
    actionUrl: '/courses/curso-novo',
  });
  expect(builders.enrollments[0].eq).toHaveBeenCalledWith('is_active', true);
  expect(builders.enrollments[0].eq).toHaveBeenCalledWith('profile.status', 'active');
  expect(builders.enrollments[0].or).toHaveBeenCalledWith(expect.stringMatching(/^expires_at\.is\.null,expires_at\.gt\./));
});

it('does not send when an audience read fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.admin.mockReturnValue({ from: (table: string) => query({
    data: table === 'courses' ? { title: 'Course', slug: 'course' } : null,
    error: table === 'access_level_courses' ? { message: 'PRIVATE' } : null,
  }) });
  await expect(notifyCoursePublished({ courseId: 'course' })).resolves.toBeUndefined();
  expect(mocks.createMany).not.toHaveBeenCalled();
});
