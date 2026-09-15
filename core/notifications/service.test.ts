// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { createNotification, createNotifications } from './service';

type WriteResult = { data: Array<{ id: string }> | null; error: unknown };

function selection(result: WriteResult) {
  return {
    single: vi.fn().mockResolvedValue({
      data: result.data?.[0] ?? null,
      error: result.error,
    }),
    then: (resolve: (value: WriteResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
}

function writer(results: WriteResult[]) {
  const select = vi.fn(() => selection(results.shift() ?? { data: [], error: null }));
  const table = {
    insert: vi.fn().mockReturnValue({ select }),
    upsert: vi.fn().mockReturnValue({ select }),
  };
  mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => table) });
  return table;
}

beforeEach(() => vi.resetAllMocks());

describe('notification persistence', () => {
  it('persists a typed descriptor together with its English recovery snapshot', async () => {
    const table = writer([{ data: [{ id: 'notice-1' }], error: null }]);
    await expect(createNotification({
      userId: 'user-1',
      type: 'enrollment',
      descriptor: {
        key: 'enrollment.singleCourse',
        params: { levelName: 'Gold', courseTitle: 'Course A' },
      },
      actionUrl: '/courses/a',
    })).resolves.toEqual({ id: 'notice-1' });
    expect(table.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      type: 'enrollment',
      title: 'Welcome to Gold',
      message: 'Your access is active. Jump into Course A to get started.',
      message_key: 'enrollment.singleCourse',
      message_params: { levelName: 'Gold', courseTitle: 'Course A' },
      action_url: '/courses/a',
    });
  });

  it('keeps literal authored content descriptor-free', async () => {
    const table = writer([{ data: [{ id: 'notice-2' }], error: null }]);
    await createNotification({
      userId: 'user-2', type: 'announcement', title: 'Exact title', message: 'Exact body',
    });
    expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Exact title', message: 'Exact body', message_key: null, message_params: null,
    }));
  });

  it('deduplicates recipients and safely resumes after a partial chunk failure', async () => {
    const users = Array.from({ length: 501 }, (_, index) => `user-${index}`);
    const success500 = { data: Array.from({ length: 500 }, (_, index) => ({ id: `first-${index}` })), error: null };
    const table = writer([
      success500,
      { data: null, error: { message: 'PRIVATE' } },
      { data: [], error: null },
      { data: [{ id: 'last' }], error: null },
    ]);
    const input = {
      userIds: [...users, users[0]],
      type: 'announcement' as const,
      title: 'Authored',
      message: 'Literal',
      dedupeKey: 'broadcast/00000000-0000-4000-8000-000000000001',
    };
    await expect(createNotifications(input)).resolves.toEqual({
      error: 'notificationInsertFailed', inserted: 500,
    });
    await expect(createNotifications(input)).resolves.toEqual({ inserted: 1, targeted: 501 });
    expect(table.upsert).toHaveBeenCalledTimes(4);
    for (const [, options] of table.upsert.mock.calls) {
      expect(options).toEqual({ onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
    }
    expect(table.upsert.mock.calls[0][0]).toHaveLength(500);
    expect(table.upsert.mock.calls[1][0]).toHaveLength(1);
  });

  it('does not expose a provider diagnostic or accept an empty dedupe identity', async () => {
    writer([{ data: null, error: { message: 'PRIVATE provider diagnostic' } }]);
    await expect(createNotification({
      userId: 'user', type: 'announcement', title: 'Title', message: 'Message',
    })).resolves.toEqual({ error: 'notificationInsertFailed' });
    await expect(createNotifications({
      userIds: ['user'], type: 'announcement', title: 'Title', message: 'Message', dedupeKey: '',
    })).resolves.toEqual({ error: 'notificationInsertFailed', inserted: 0 });
  });
});
