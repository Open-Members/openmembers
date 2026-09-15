// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ client: vi.fn(), getUser: vi.fn(), from: vi.fn(), delete: vi.fn(), eq: vi.fn(), rate: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/core/rate-limit', () => ({ rateLimit: mocks.rate }));
import { POST, DELETE } from './route';

function withdraw(body: unknown = { endpoint: 'https://push.example.test/subscription' }) {
  return DELETE(new NextRequest('https://members.example.test/api/notifications/subscribe', { method: 'DELETE', body: JSON.stringify(body) }));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55431');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fictitious-public-key');
  mocks.client.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'student-id' } } });
  mocks.rate.mockReturnValue({ success: true });
  mocks.from.mockReturnValue({ delete: mocks.delete });
  mocks.delete.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValueOnce({ eq: mocks.eq }).mockResolvedValue({ error: null });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('push delivery is deferred while withdrawal remains available', () => {
  it('rejects new subscriptions without opening a client', async () => {
    expect((await POST()).status).toBe(503);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('requires Supabase configuration for withdrawal', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ' ');
    expect((await withdraw()).status).toBe(503);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('requires an authenticated user for withdrawal', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await withdraw()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('rejects malformed withdrawal payloads without modifying subscriptions', async () => {
    expect((await withdraw({ endpoint: 'not a URL' })).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('deletes only the authenticated user subscription', async () => {
    expect((await withdraw()).status).toBe(200);
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('push_subscriptions');
    expect(mocks.eq).toHaveBeenNthCalledWith(1, 'user_id', 'student-id');
    expect(mocks.eq).toHaveBeenNthCalledWith(2, 'endpoint', 'https://push.example.test/subscription');
  });
  it('does not claim withdrawal succeeded when persistence fails', async () => {
    mocks.eq.mockReset().mockReturnValueOnce({ eq: mocks.eq }).mockResolvedValue({ error: { message: 'private database error' } });
    const response = await withdraw();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private database error');
  });
});
