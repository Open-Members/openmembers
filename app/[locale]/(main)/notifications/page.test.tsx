// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
const mocks = vi.hoisted(() => ({ client: vi.fn(), user: vi.fn(), redirect: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/features/Notifications/components/NotificationsPageClient', () => ({ NotificationsPageClient: () => null }));
import Page from './page';
let result: { data: unknown; error: unknown };
let query: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> };
let from: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  result = { data: [], error: null };
  query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn(async () => result) };
  from = vi.fn(() => query);
  mocks.user.mockResolvedValue({ data: { user: { id: 'user' } }, error: null });
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.user }, from });
  mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT fixture'); });
});
function child(element: ReactElement) { return (element.props as { children: ReactElement }).children as ReactElement<{ initialLoadFailed: boolean; initialNotifications: unknown[]; initialNow: string }>; }
describe('notifications page loading boundary', () => {
  it.each(['missing', 'errored'] as const)('redirects %s identities before notification reads', async state => {
    mocks.user.mockResolvedValue({ data: { user: state === 'missing' ? null : { id: 'user' } }, error: state === 'errored' ? new Error('PRIVATE') : null });
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT fixture');
    expect(mocks.redirect).toHaveBeenCalledWith('/login');
    expect(from).not.toHaveBeenCalled();
  });
  it.each(['provider', 'transport', 'missing'] as const)('passes explicit initial load failure for %s errors', async state => {
    if (state === 'provider') result.error = { message: 'PRIVATE diagnostic' };
    if (state === 'missing') result.data = null;
    if (state === 'transport') query.limit.mockRejectedValue(new Error('PRIVATE transport'));
    const view = child(await Page());
    expect(view.props.initialLoadFailed).toBe(true);
    expect(view.props.initialNotifications).toEqual([]);
    expect(view.key).toBe('failed');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user');
  });
  it('distinguishes empty success with a remount key and stable SSR instant', async () => {
    const view = child(await Page());
    expect(view.props.initialLoadFailed).toBe(false);
    expect(view.key).toBe('loaded');
    expect(Number.isFinite(Date.parse(view.props.initialNow))).toBe(true);
    expect(query.limit).toHaveBeenCalledWith(200);
  });
  it('passes descriptors and literal snapshots through the server-to-client boundary', async () => {
    result.data = [
      {
        id: 'descriptor', user_id: 'user', type: 'drip_unlock',
        title: 'New content in Authored course',
        message: 'Fresh content is waiting for you in Authored course.',
        message_key: 'content.dripCourse',
        message_params: { courseTitle: 'Authored course' },
        action_url: '/courses/authored', is_read: false,
        created_at: '2026-09-13T10:00:00.000Z',
      },
      {
        id: 'literal', user_id: 'user', type: 'announcement',
        title: 'Authored literal title', message: 'Authored literal message',
        message_key: null, message_params: null, action_url: null,
        is_read: true, created_at: '2026-09-12T10:00:00.000Z',
      },
    ];

    const view = child(await Page());

    expect(query.select).toHaveBeenCalledWith(
      'id, user_id, type, title, message, message_key, message_params, action_url, is_read, created_at',
    );
    expect(view.props.initialNotifications).toEqual([
      {
        id: 'descriptor', userId: 'user', type: 'drip_unlock',
        title: 'New content in Authored course',
        message: 'Fresh content is waiting for you in Authored course.',
        messageKey: 'content.dripCourse',
        messageParams: { courseTitle: 'Authored course' },
        actionUrl: '/courses/authored', isRead: false,
        createdAt: '2026-09-13T10:00:00.000Z',
      },
      {
        id: 'literal', userId: 'user', type: 'announcement',
        title: 'Authored literal title', message: 'Authored literal message',
        messageKey: null, messageParams: null, actionUrl: null,
        isRead: true, createdAt: '2026-09-12T10:00:00.000Z',
      },
    ]);
  });
});
