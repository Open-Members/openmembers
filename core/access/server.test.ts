import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  profile: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/core/supabase/server', () => ({ createClient: state.createClient }));
import { isUserCourseAccessible, isUserLessonAccessible } from './server';

beforeEach(() => {
  vi.resetAllMocks();
  state.getUser.mockResolvedValue({ data: { user: { id: 'session-user' } }, error: null });
  state.profile.mockResolvedValue({ data: { role: 'user', status: 'active' }, error: null });
  state.rpc.mockResolvedValue({ data: true, error: null });
  const builder = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: state.profile };
  state.createClient.mockResolvedValue({ auth: { getUser: state.getUser }, from: () => builder, rpc: state.rpc });
});

for (const [name, gate, rpcName, parameter] of [
  ['course', isUserCourseAccessible, 'can_access_course', 'p_course_id'],
  ['lesson', isUserLessonAccessible, 'can_access_lesson', 'p_lesson_id'],
] as const) {
  describe(`${name} permission boundary`, () => {
    it('uses the session RPC without a caller-supplied identity parameter', async () => {
      expect(await gate('session-user', 'content-id')).toBe(true);
      expect(state.rpc).toHaveBeenCalledExactlyOnceWith(rpcName, { [parameter]: 'content-id' });
    });

    it.each([null, undefined, 'other-user'])('denies absent or impersonated identity: %s', async (userId) => {
      expect(await gate(userId, 'content-id')).toBe(false);
      expect(state.rpc).not.toHaveBeenCalled();
    });

    it('denies a missing session', async () => {
      state.getUser.mockResolvedValue({ data: { user: null }, error: null });
      expect(await gate('session-user', 'content-id')).toBe(false);
      expect(state.rpc).not.toHaveBeenCalled();
    });

    it.each([
      { data: null, error: null },
      { data: { role: 'admin', status: 'suspended' }, error: null },
      { data: { role: 'user', status: 'active' }, error: { message: 'unavailable' } },
    ])('denies missing, suspended and unreadable profiles', async (profile) => {
      state.profile.mockResolvedValue(profile);
      expect(await gate('session-user', 'content-id')).toBe(false);
      expect(state.rpc).not.toHaveBeenCalled();
    });

    it.each([
      { data: false, error: null },
      { data: null, error: null },
      { data: 'true', error: null },
      { data: true, error: { message: 'unavailable' } },
    ])('requires an explicit successful boolean permission', async (decision) => {
      state.rpc.mockResolvedValue(decision);
      expect(await gate('session-user', 'content-id')).toBe(false);
    });

    it('fails closed if the client or RPC throws', async () => {
      state.rpc.mockRejectedValue(new Error('connection failed'));
      expect(await gate('session-user', 'content-id')).toBe(false);
      state.createClient.mockRejectedValue(new Error('configuration unavailable'));
      expect(await gate('session-user', 'content-id')).toBe(false);
    });
  });
}
