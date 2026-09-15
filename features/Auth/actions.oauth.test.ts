// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn(), oauth: vi.fn(), headers: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
import { signInWithOAuth } from './actions';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('OAUTH_PROVIDERS', '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://members.example.test');
  vi.stubEnv('AUTH_ALLOWED_ORIGINS', '');
  mocks.client.mockResolvedValue({ auth: { signInWithOAuth: mocks.oauth } });
  mocks.headers.mockResolvedValue(new Headers({ origin: 'https://members.example.test' }));
  mocks.oauth.mockResolvedValue({ data: { url: 'https://supabase.example.test/auth/v1/authorize' }, error: null });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('OAuth action availability', () => {
  it.each([
    { data: null, error: { code: 'unexpected_failure', message: 'Private detail' } },
    { data: { url: null }, error: null },
  ])('returns stable keys for failed or missing provider redirects', async response => {
    vi.stubEnv('OAUTH_PROVIDERS', 'google');
    mocks.oauth.mockResolvedValue(response);
    expect(await signInWithOAuth('google')).toEqual({ error: response.error ? 'oauthFailed' : 'oauthRedirectMissing' });
  });
  it('contains unexpected transport errors', async () => {
    vi.stubEnv('OAUTH_PROVIDERS', 'google');
    mocks.oauth.mockRejectedValue(new Error('Private detail'));
    expect(await signInWithOAuth('google')).toEqual({ error: 'oauthFailed' });
  });
  it.each(['google', 'apple'] as const)('disables %s before opening a client by default', async provider => {
    expect(await signInWithOAuth(provider)).toEqual({ error: 'providerDisabled' });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.headers).not.toHaveBeenCalled();
  });
  it('does not infer Apple availability from Google configuration', async () => {
    vi.stubEnv('OAUTH_PROVIDERS', 'google');
    expect(await signInWithOAuth('apple')).toHaveProperty('error');
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('passes the trusted installation callback only for an explicitly enabled provider', async () => {
    vi.stubEnv('OAUTH_PROVIDERS', 'google');
    expect(await signInWithOAuth('google')).toEqual({ url: 'https://supabase.example.test/auth/v1/authorize' });
    expect(mocks.oauth).toHaveBeenCalledExactlyOnceWith({ provider: 'google', options: { redirectTo: 'https://members.example.test/api/auth/callback' } });
  });
  it('rejects an unsupported provider even if it appears in the environment', async () => {
    vi.stubEnv('OAUTH_PROVIDERS', 'unsupported');
    expect(await signInWithOAuth('unsupported' as 'google')).toEqual({ error: 'invalidProvider' });
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
