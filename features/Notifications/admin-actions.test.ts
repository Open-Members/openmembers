// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  createNotifications: vi.fn(),
}));

vi.mock('@/core/access/admin', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/core/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/core/notifications/service', () => ({
  createNotifications: mocks.createNotifications,
}));

import {
  sendBroadcast,
  type BroadcastAudience,
  type BroadcastInput,
} from './admin-actions';

const validInput: BroadcastInput = {
  requestId: '00000000-0000-4000-8000-000000000001',
  title: 'Authored announcement',
  message: 'Authored body',
  actionUrl: null,
  audience: { kind: 'all' },
};
let queries: Array<{ table: string; query: Record<string, ReturnType<typeof vi.fn>> }>;

beforeEach(() => {
  vi.resetAllMocks();
  queries = [];
  mocks.requireAdmin.mockResolvedValue({});
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [{ id: 'fixture-user', user_id: 'fixture-user' }], error: null }),
      };
      queries.push({ table, query });
      return query;
    }),
  });
  mocks.createNotifications.mockResolvedValue({ inserted: 1, targeted: 1 });
});

describe('sendBroadcast input boundaries', () => {
  it.each(['', 'same-on-every-send', '00000000-0000-0000-0000-000000000000'])(
    'rejects an invalid delivery request ID: %s',
    async (requestId) => {
      await expect(sendBroadcast({ ...validInput, requestId })).resolves.toEqual({ error: 'invalidInput' });
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    },
  );
  it.each([
    { kind: 'access_level', id: '' },
    { kind: 'access_level', id: '   ' },
    { kind: 'course', id: '' },
    { kind: 'course', id: '   ' },
  ] as BroadcastAudience[])('rejects an empty $kind segment', async (audience) => {
    await expect(sendBroadcast({ ...validInput, audience })).resolves.toEqual({
      error: 'invalidInput',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createNotifications).not.toHaveBeenCalled();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,unsafe',
    '//evil.example.test/path',
    '/%2Fevil.example.test/path',
    'http://evil.example.test/path',
    'mailto:help@example.test',
  ])('rejects an unsafe action URL: %s', async (actionUrl) => {
    await expect(
      sendBroadcast({ ...validInput, actionUrl }),
    ).resolves.toEqual({ error: 'invalidActionUrl' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createNotifications).not.toHaveBeenCalled();
  });

  it.each([
    '/courses/new-release?from=announcement#lesson',
    'https://docs.example.test/member/help',
  ])('preserves a valid action URL: %s', async (actionUrl) => {
    await expect(
      sendBroadcast({ ...validInput, actionUrl }),
    ).resolves.toEqual({ sent: 1 });
    expect(mocks.createNotifications).toHaveBeenCalledWith({
      userIds: ['fixture-user'],
      type: 'announcement',
      title: validInput.title,
      message: validInput.message,
      actionUrl,
      dedupeKey: `broadcast/${validInput.requestId}`,
    });
    expect(queries.find(({ table }) => table === 'profiles')?.query.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('filters a segmented audience by active profile, active enrollment and expiration', async () => {
    await expect(sendBroadcast({
      ...validInput,
      audience: { kind: 'access_level', id: ' level-id ' },
    })).resolves.toEqual({ sent: 1 });
    const enrollments = queries.find(({ table }) => table === 'enrollments')!.query;
    expect(enrollments.in).toHaveBeenCalledWith('access_level_id', ['level-id']);
    expect(enrollments.eq).toHaveBeenCalledWith('is_active', true);
    expect(enrollments.eq).toHaveBeenCalledWith('profile.status', 'active');
    expect(enrollments.or).toHaveBeenCalledWith(expect.stringMatching(/^expires_at\.is\.null,expires_at\.gt\./));
  });

  it('maps a rejected insert to a stable operation error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.createNotifications.mockRejectedValue(new Error('PRIVATE transport'));
    await expect(sendBroadcast(validInput)).resolves.toEqual({ error: 'operationFailed' });
  });
});
