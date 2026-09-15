// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), settings: vi.fn() }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/core/theme/settings', () => ({ getTenantSettings: mocks.settings }));
import { getEmailTransport } from './config';
import { sendTransactional, wasRecentlySent } from './resend';
const input = { userId: 'fictitious-user', to: { email: 'student@example.test' }, templateKey: 'fixture', subject: 'Fixture subject', html: '<p>Fixture</p>', text: 'Fixture', idempotencyKey: 'fixture/1' };
const insert = vi.fn();
beforeEach(() => {
  vi.stubEnv('EMAIL_TRANSPORT', 'resend'); vi.stubEnv('RESEND_API_KEY', 'fictitious-key');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55431'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fictitious-admin');
  vi.stubEnv('RESEND_SENDER_EMAIL', 'sender@example.test');
  mocks.settings.mockResolvedValue({ site_name: 'Fixture School' });
  insert.mockReset().mockResolvedValue({ error: null }); mocks.admin.mockReturnValue({ from: () => ({ insert }) });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 'fixture-message-id' })));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('passes stable Resend idempotency and limits transport duration and redirects', async () => {
  expect(await sendTransactional(input)).toEqual({ success: true, messageId: 'fixture-message-id' });
  expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal), headers: expect.objectContaining({ 'Idempotency-Key': 'fixture/1' }) }));
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', metadata: { transport: 'resend' } }));
});
it.each(['http://127.0.0.1:55434', 'http://localhost:55434', 'http://[::1]:55434', 'http://host.docker.internal:56434/'])('captures to the local Mailpit origin %s with fictitious sender and no external credentials', async origin => {
  vi.stubEnv('EMAIL_TRANSPORT', 'mailpit'); vi.stubEnv('MAILPIT_URL', origin);
  vi.mocked(fetch).mockResolvedValue(Response.json({ ID: 'fixture-capture-id' }));
  expect((await sendTransactional(input)).success).toBe(true);
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe(`${new URL(origin).origin}/api/v1/send`);
  expect(options).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
  expect(options?.headers).not.toHaveProperty('Authorization');
  expect(JSON.parse(options!.body as string)).toMatchObject({ From: { Email: 'openmembers@example.test' }, To: [{ Email: input.to.email }] });
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', metadata: { transport: 'mailpit' } }));
});
it.each([
  'https://mail.example.test', 'http://localhost.evil.test', 'http://user@localhost:55434',
  'http://localhost:55434/path', 'http://localhost:55434?redirect=remote', 'http://192.0.2.1',
  'https://host.docker.internal:56434', 'http://host.docker.internal.evil.test:56434',
  'http://host.docker.internal.:56434', 'http://user:password@host.docker.internal:56434',
  'http://host.docker.internal:56434/path', 'http://host.docker.internal:56434/../',
  'http://host.docker.internal:56434?redirect=remote', 'http://host.docker.internal:56434#remote',
  'http://host.docker.internal:56434\\@evil.test', 'http://host.docker.internal\n:56434',
])('refuses capture endpoint %s without fallback', async url => {
  vi.stubEnv('EMAIL_TRANSPORT', 'mailpit'); vi.stubEnv('MAILPIT_URL', url);
  expect(getEmailTransport()).toBeNull(); expect((await sendTransactional(input)).success).toBe(false); expect(fetch).not.toHaveBeenCalled();
});
it('missing and unknown transport configurations fail before any database or network call', async () => {
  vi.stubEnv('RESEND_API_KEY', ''); expect((await sendTransactional(input)).success).toBe(false);
  vi.stubEnv('EMAIL_TRANSPORT', 'unknown'); expect((await sendTransactional(input)).success).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([500, 429, 401])('provider HTTP %i failure remains visible with no provider body echoed', async status => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ message: 'private-user@example.test' }, { status }));
  const result = await sendTransactional(input); expect(result.success).toBe(false); expect(result.error).not.toContain('private-user');
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
});
it('an accepted send stays accepted if its audit insert fails, avoiding automatic duplicate resend', async () => {
  insert.mockResolvedValue({ error: { message: 'fixture audit failure' } });
  expect((await sendTransactional(input)).success).toBe(true); expect(console.error).toHaveBeenCalled();
});
it('timeout and invalid accepted response are failures without an external fallback', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('timeout at secret destination'));
  expect((await sendTransactional(input)).error).toBe('Email transport or configuration failed');
  vi.mocked(fetch).mockResolvedValue(Response.json({})); expect((await sendTransactional(input)).success).toBe(false);
});
it('cooldown database errors fail closed', async () => {
  const query = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ error: { message: 'offline' } }) };
  for (const key of ['select', 'eq', 'gte', 'limit'] as const) query[key].mockReturnValue(query);
  mocks.admin.mockReturnValue({ from: () => query });
  await expect(wasRecentlySent('fixture-user', 'fixture-campaign', 8)).rejects.toThrow('cooldown');
});
it('computes campaign cooldown from the supplied job clock', async () => {
  const query = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
  for (const key of ['select', 'eq', 'gte', 'limit'] as const) query[key].mockReturnValue(query);
  mocks.admin.mockReturnValue({ from: () => query });
  await expect(wasRecentlySent(
    'fixture-user',
    'fixture-campaign',
    8,
    new Date('2026-09-12T12:00:00.000Z'),
  )).resolves.toBe(false);
  expect(query.gte).toHaveBeenCalledWith('sent_at', '2026-09-04T12:00:00.000Z');
});
