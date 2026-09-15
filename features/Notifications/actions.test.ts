// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ client: vi.fn(), user: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.client }));
import { deleteNotification, markAllNotificationsRead, markNotificationRead } from './actions';
const id = '10000000-0000-4000-8000-000000000001';
let result: { data: unknown; error: unknown };
let query: { update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn>; then: (resolve: (value: typeof result) => unknown) => Promise<unknown> };
let from: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  result = { data: { id }, error: null };
  query = { update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => result), then: resolve => Promise.resolve(result).then(resolve) };
  from = vi.fn(() => query);
  mocks.user.mockResolvedValue({ data: { user: { id: 'session-user' } }, error: null });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.user }, from });
});
const actions = [
  ['mark', () => markNotificationRead(id), 'readFailed'],
  ['delete', () => deleteNotification(id), 'deleteFailed'],
  ['mark all', markAllNotificationsRead, 'readAllFailed'],
] as const;
describe.each(actions)('%s notifications', (_name, action, failed) => {
  it.each(['missing', 'errored'] as const)('denies %s identities without a write', async state => {
    mocks.user.mockResolvedValue({ data: { user: state === 'missing' ? null : { id: 'session-user' } }, error: state === 'errored' ? new Error('PRIVATE') : null });
    expect(await action()).toEqual({ error: 'notAuthenticated' });
    expect(from).not.toHaveBeenCalled();
  });
  it('limits writes to the verified user', async () => {
    expect(await action()).toEqual({ success: true });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'session-user');
  });
  it('does not claim success after database failure', async () => {
    result.error = { message: 'PRIVATE provider diagnostic' };
    expect(await action()).toEqual({ error: failed });
  });
  it('masks thrown failures', async () => {
    mocks.client.mockRejectedValue(new Error('PRIVATE network diagnostic'));
    expect(await action()).toEqual({ error: failed });
  });
});
it.each([markNotificationRead, deleteNotification])('rejects invalid IDs before Auth/DB', async action => {
  expect(await action('invalid')).toEqual({ error: 'invalidInput' });
  expect(mocks.client).not.toHaveBeenCalled();
});
it.each([markNotificationRead, deleteNotification])('does not claim a single-row mutation succeeded with no row', async action => {
  result.data = null;
  expect(await action(id)).toEqual({ error: 'unavailable' });
  expect(query.eq).toHaveBeenCalledWith('id', id);
  expect(query.select).toHaveBeenCalledWith('id');
});
it('marks only unread rows for the current user and accepts an already-empty unread set', async () => {
  result.data = null;
  expect(await markAllNotificationsRead()).toEqual({ success: true });
  expect(query.eq).toHaveBeenCalledWith('is_read', false);
  expect(query.update).toHaveBeenCalledWith({ is_read: true });
});
