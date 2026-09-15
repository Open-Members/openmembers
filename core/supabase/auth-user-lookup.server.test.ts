// @vitest-environment node
import { AuthError, type User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthUserLookupError, getAuthEmailsByIds } from './auth-user-lookup.server';

type AuthAdmin = Parameters<typeof getAuthEmailsByIds>[0];
function user(id: string): User {
  return {
    id, email: `${id}@example.test`, aud: 'authenticated',
    app_metadata: {}, user_metadata: {}, created_at: '2026-09-14T00:00:00.000Z',
  };
}

describe('exact administrative account lookup', () => {
  it('does no Auth work for an empty list', async () => {
    const getUserById = vi.fn<AuthAdmin['getUserById']>();
    expect(await getAuthEmailsByIds({ getUserById }, [])).toEqual(new Map());
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('deduplicates IDs and returns only the requested account emails', async () => {
    const getUserById = vi.fn<AuthAdmin['getUserById']>().mockImplementation(async (id) => ({ data: { user: user(id) }, error: null }));
    const result = await getAuthEmailsByIds({ getUserById }, ['account-1001', 'account-2', 'account-1001']);
    expect([...result]).toEqual([['account-1001', 'account-1001@example.test'], ['account-2', 'account-2@example.test']]);
    expect(getUserById).toHaveBeenCalledTimes(2);
  });

  it('resolves more than 1000 IDs with at most five outstanding requests', async () => {
    let active = 0;
    let maximum = 0;
    const getUserById = vi.fn<AuthAdmin['getUserById']>().mockImplementation(async (id) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return { data: { user: user(id) }, error: null };
    });
    const ids = Array.from({ length: 1001 }, (_, index) => `account-${index + 1}`);
    const result = await getAuthEmailsByIds({ getUserById }, ids);
    expect(result.size).toBe(1001);
    expect(result.get('account-1001')).toBe('account-1001@example.test');
    expect(maximum).toBe(5);
  });

  it('does not return partial results or fetch later batches after an Auth failure', async () => {
    const getUserById = vi.fn<AuthAdmin['getUserById']>().mockImplementation(async (id) => ({ data: { user: user(id) }, error: null }));
    getUserById.mockResolvedValueOnce({ data: { user: null }, error: new AuthError('private provider diagnostic', 503) });
    await expect(getAuthEmailsByIds({ getUserById }, ['one', 'two', 'three', 'four', 'five', 'six'])).rejects.toThrow('AUTH_USER_LOOKUP_FAILED');
    expect(getUserById).toHaveBeenCalledTimes(5);
  });

  it('rejects a response that refers to a different account', async () => {
    const getUserById = vi.fn<AuthAdmin['getUserById']>().mockResolvedValue({ data: { user: user('different') }, error: null });
    await expect(getAuthEmailsByIds({ getUserById }, ['requested'])).rejects.toBeInstanceOf(AuthUserLookupError);
  });

  it('keeps network diagnostics out of the public error', async () => {
    const getUserById = vi.fn<AuthAdmin['getUserById']>().mockRejectedValue(new Error('private network diagnostic'));
    await expect(getAuthEmailsByIds({ getUserById }, ['requested'])).rejects.toThrow('AUTH_USER_LOOKUP_FAILED');
  });

  it('preserves an account without an email as an empty email field', async () => {
    const getUserById = vi.fn<AuthAdmin['getUserById']>().mockResolvedValue({ data: { user: { ...user('phone'), email: undefined } }, error: null });
    expect((await getAuthEmailsByIds({ getUserById }, ['phone'])).get('phone')).toBe('');
  });
});
