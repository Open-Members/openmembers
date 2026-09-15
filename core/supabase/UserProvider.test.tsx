import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const mock = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('./client', () => ({ createClient: mock.client }));
import { UserProvider, useUser } from './UserProvider';

type Profile = { role: string; status: string; avatar_url: string };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
function user(id: string) { return { id, user_metadata: {} } as User; }
function Probe() {
  const value = useUser();
  return <div data-testid="session">{JSON.stringify({ id: value.userId, role: value.role, status: value.status, avatar: value.avatarUrl, loading: value.loading })}</div>;
}
function readContext() { return JSON.parse(screen.getByTestId('session').textContent!); }

let authCallback: (event: string, session: { user: User } | null) => void;
let profiles: Map<string, Promise<{ data: Profile | null; error: null }>>;
let unsubscribe: ReturnType<typeof vi.fn>;
beforeEach(() => {
  profiles = new Map();
  unsubscribe = vi.fn();
  mock.client.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: (callback: typeof authCallback) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe } } };
      },
    },
    from: () => {
      let id = '';
      return {
        select() { return this; },
        eq(_column: string, value: string) { id = value; return this; },
        single: () => profiles.get(id) ?? Promise.resolve({ data: null, error: null }),
      };
    },
  });
});
afterEach(cleanup);

async function signIn(id: string) {
  await act(async () => { authCallback('SIGNED_IN', { user: user(id) }); });
}

describe('user context identity transitions', () => {
  it('clears privileged profile state immediately when the identity changes', async () => {
    profiles.set('admin-a', Promise.resolve({ data: { role: 'admin', status: 'active', avatar_url: '/a.png' }, error: null }));
    const pendingB = deferred<{ data: Profile; error: null }>();
    profiles.set('student-b', pendingB.promise);
    render(<UserProvider><Probe /></UserProvider>);
    await signIn('admin-a');
    await waitFor(() => expect(readContext().role).toBe('admin'));
    await signIn('student-b');
    expect(readContext()).toEqual({ id: 'student-b', role: 'user', status: 'suspended', avatar: null, loading: true });
    await act(async () => { pendingB.resolve({ data: { role: 'user', status: 'active', avatar_url: '/b.png' }, error: null }); });
    expect(readContext()).toEqual({ id: 'student-b', role: 'user', status: 'active', avatar: '/b.png', loading: false });
  });

  it('ignores a prior account profile that resolves after logout', async () => {
    const pendingA = deferred<{ data: Profile; error: null }>();
    profiles.set('admin-a', pendingA.promise);
    const view = render(<UserProvider><Probe /></UserProvider>);
    await signIn('admin-a');
    await act(async () => { authCallback('SIGNED_OUT', null); });
    await act(async () => { pendingA.resolve({ data: { role: 'super_admin', status: 'active', avatar_url: '/a.png' }, error: null }); });
    expect(readContext()).toEqual({ id: '', role: 'user', status: 'suspended', avatar: null, loading: false });
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not expose an admin role when the new account profile is unavailable', async () => {
    profiles.set('unknown', Promise.resolve({ data: null, error: null }));
    render(<UserProvider><Probe /></UserProvider>);
    await signIn('unknown');
    await waitFor(() => expect(readContext().loading).toBe(false));
    expect(readContext()).toEqual({ id: 'unknown', role: 'user', status: 'suspended', avatar: null, loading: false });
  });
});
