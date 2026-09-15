// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('@/core/supabase/client', () => ({ createClient: mocks.client }));
import { fetchNotifications, fetchUnreadCount } from './queries';
let result: { data: unknown; error: unknown; count: number | null };
let query: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn>; then: (resolve: (value: typeof result) => unknown) => Promise<unknown> };
beforeEach(() => {
  vi.resetAllMocks();
  result = { data: [], error: null, count: 0 };
  query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), then: resolve => Promise.resolve(result).then(resolve) };
  mocks.client.mockReturnValue({ from: vi.fn(() => query) });
});
describe('notification reads', () => {
  it('preserves authored title/message and uses own-user filter, order and limit', async () => {
    result.data = [{ id: 'notification', user_id: 'user', type: 'announcement', title: 'Authored English title', message: 'Authored English message', action_url: '/courses', is_read: false, created_at: '2026-09-12T10:00:00Z' }];
    expect(await fetchNotifications('user', 12)).toEqual([{ id: 'notification', userId: 'user', type: 'announcement', title: 'Authored English title', message: 'Authored English message', messageKey: null, messageParams: null, actionUrl: '/courses', isRead: false, createdAt: '2026-09-12T10:00:00Z' }]);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user');
    expect(query.limit).toHaveBeenCalledWith(12);
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });
  it('distinguishes a successful empty list/count', async () => {
    expect(await fetchNotifications('user')).toEqual([]);
    expect(await fetchUnreadCount('user')).toBe(0);
    expect(query.eq).toHaveBeenCalledWith('is_read', false);
  });
  it('maps an automatic descriptor without interpreting it during the database read', async () => {
    result.data = [{
      id: 'automatic', user_id: 'user', type: 'new_course', title: 'English fallback',
      message: 'English message', message_key: 'content.coursePublished',
      message_params: { courseTitle: 'Course' }, action_url: null, is_read: false,
      created_at: '2026-09-12T10:00:00Z',
    }];
    expect((await fetchNotifications('user'))[0]).toMatchObject({
      messageKey: 'content.coursePublished', messageParams: { courseTitle: 'Course' },
      title: 'English fallback', message: 'English message',
    });
  });
  it.each(['provider', 'transport', 'missing'] as const)('does not turn %s list errors into an empty list', async state => {
    if (state === 'provider') result.error = { message: 'PRIVATE' };
    if (state === 'missing') result.data = null;
    if (state === 'transport') mocks.client.mockImplementation(() => { throw new Error('PRIVATE'); });
    await expect(fetchNotifications('user')).rejects.toThrow(/^loadFailed$/);
  });
  it.each(['provider', 'transport', 'missing'] as const)('does not turn %s count errors into zero', async state => {
    if (state === 'provider') result.error = { message: 'PRIVATE' };
    if (state === 'missing') result.count = null;
    if (state === 'transport') mocks.client.mockImplementation(() => { throw new Error('PRIVATE'); });
    await expect(fetchUnreadCount('user')).rejects.toThrow(/^countFailed$/);
  });
});
