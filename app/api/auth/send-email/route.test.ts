// @vitest-environment node
import { createHmac } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn(), settings: vi.fn(), locale: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/services/email/resend', () => ({ sendTransactional: mocks.send }));
vi.mock('@/core/theme/settings', () => ({ getTenantSettings: mocks.settings }));
vi.mock('@/core/i18n/recipient-locale.server', () => ({ resolveRecipientLocale: mocks.locale }));
vi.mock('@/lib/services/email/templates/load', () => ({
  loadLocalizedTemplateContent: mocks.load,
  loadTemplateContent: vi.fn(),
  saveTemplateContent: vi.fn(),
  resetTemplateContent: vi.fn(),
}));
import { POST } from './route';
const key = Buffer.from('fictitious-email-signature-fixture');
const base = { user: { id: '11111111-1111-4111-8111-111111111111', email: 'current@example.test', user_metadata: { display_name: 'Fixture Student' } }, email_data: { email_action_type: 'recovery', token_hash: 'fixture-hash', token: '123456', site_url: 'https://untrusted.example.test', redirect_to: 'https://untrusted.example.test' } };
function request(payload: unknown = base, { version = 'v1', age = 0, raw }: { version?: string; age?: number; raw?: string } = {}) {
  const body = raw ?? JSON.stringify(payload); const ts = String(Math.floor(Date.now() / 1000) - age);
  const signature = createHmac('sha256', key).update(`fixture-hook-id.${ts}.${body}`).digest('base64');
  return new Request('https://academy.example.test/api/auth/send-email', { method: 'POST', body, headers: { 'webhook-id': 'fixture-hook-id', 'webhook-timestamp': ts, 'webhook-signature': `${version},${signature}` } });
}
beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({ success: true, messageId: 'fixture-id' });
  mocks.locale.mockReset().mockResolvedValue({ locale: 'en', source: 'profile' });
  mocks.load.mockReset().mockImplementation(async (templateKey: string, locale: 'en' | 'pt' | 'es') => {
    const { EMAIL_TEMPLATE_DEFAULTS } = await import('@/lib/services/email/templates/localization');
    return EMAIL_TEMPLATE_DEFAULTS[templateKey as keyof typeof EMAIL_TEMPLATE_DEFAULTS][locale];
  });
  mocks.settings.mockReset().mockResolvedValue({ site_name: 'Fixture School', primary_color: '#0f766e', email_from_address: 'sender@example.test' });
  for (const [name, value] of Object.entries({ EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'fixture-key', SEND_EMAIL_HOOK_SECRET: `v1,whsec_${key.toString('base64')}`, NEXT_PUBLIC_SITE_URL: 'https://academy.example.test', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55431', SUPABASE_SERVICE_ROLE_KEY: 'fixture-admin' })) vi.stubEnv(name, value);
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(['recovery', 'signup', 'invite', 'magiclink'])('renders %s on the configured origin with stable idempotency', async action => {
  expect((await POST(request({ ...base, email_data: { ...base.email_data, email_action_type: action } }))).status).toBe(200);
  const email = mocks.send.mock.calls[0][0]; expect(email.html).toContain('https://academy.example.test/api/auth/callback'); expect(email.html).not.toContain('untrusted.example.test'); expect(email.idempotencyKey).toMatch(/^auth\/[a-f0-9]{64}$/);
});
it('secure email change sends current and new addresses their correctly paired hashes', async () => {
  const payload = { ...base, user: { ...base.user, new_email: 'new@example.test' }, email_data: { ...base.email_data, email_action_type: 'email_change', token_hash: 'new-address-hash', token_hash_new: 'current-address-hash' } };
  expect((await POST(request(payload))).status).toBe(200); expect(mocks.send).toHaveBeenCalledTimes(2);
  const [current, changed] = mocks.send.mock.calls.map(call => call[0]);
  expect(current.to.email).toBe('current@example.test'); expect(current.html).toContain('token_hash=current-address-hash');
  expect(changed.to.email).toBe('new@example.test'); expect(changed.html).toContain('token_hash=new-address-hash');
  expect(current.idempotencyKey).not.toBe(changed.idempotencyKey);
});
it('non-secure email change sends only to the new address', async () => {
  expect((await POST(request({ ...base, user: { ...base.user, new_email: 'new@example.test' }, email_data: { ...base.email_data, email_action_type: 'email_change' } }))).status).toBe(200);
  expect(mocks.send).toHaveBeenCalledOnce(); expect(mocks.send.mock.calls[0][0].to.email).toBe('new@example.test');
});
it('reauthentication sends the OTP without requiring a token hash or exposing a callback link', async () => {
  expect((await POST(request({ ...base, email_data: { email_action_type: 'reauthentication', token: '123456' } }))).status).toBe(200);
  const email = mocks.send.mock.calls[0][0]; expect(email.templateKey).toBe('reauthentication'); expect(email.text).toContain('123456'); expect(email.html).not.toContain('/api/auth/callback');
});
it.each([{ version: 'v2' }, { age: 301 }, { age: -301 }])('rejects invalid signature version or replay before rendering', async options => {
  expect((await POST(request(base, options))).status).toBe(401); expect(mocks.send).not.toHaveBeenCalled();
});
it.each([null, {}, { ...base, user: { ...base.user, id: 'not-a-uuid' } }, { ...base, email_data: { email_action_type: 'reauthentication', token: '<script>' } }, { ...base, email_data: { ...base.email_data, email_action_type: 'email_change' } }])('rejects malformed signed input', async payload => {
  expect((await POST(request(payload))).status).toBe(400); expect(mocks.send).not.toHaveBeenCalled();
});
it('failed second email returns retryable failure with stable independent keys on retry', async () => {
  mocks.send.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'private-provider-detail' });
  const payload = { ...base, user: { ...base.user, new_email: 'new@example.test' }, email_data: { ...base.email_data, email_action_type: 'email_change', token_hash_new: 'current-address-hash' } };
  const response = await POST(request(payload)); expect(response.status).toBe(502); expect(await response.json()).toEqual({ error: 'send_failed' });
  await POST(request(payload)); expect(mocks.send.mock.calls[0][0].idempotencyKey).toBe(mocks.send.mock.calls[2][0].idempotencyKey);
});
it('local capture permits the hook with no Resend sender or key', async () => {
  vi.stubEnv('EMAIL_TRANSPORT', 'mailpit'); vi.stubEnv('MAILPIT_URL', 'http://127.0.0.1:55434'); vi.stubEnv('RESEND_API_KEY', '');
  mocks.settings.mockResolvedValue({ site_name: 'Fixture School' }); expect((await POST(request())).status).toBe(200);
});
it('uses the Auth delivery hint and records the resolved locale source', async () => {
  mocks.locale.mockResolvedValue({ locale: 'pt', source: 'hint' });
  const payload = {
    ...base,
    user: { ...base.user, user_metadata: { ...base.user.user_metadata, delivery_locale: 'pt' } },
    email_data: { ...base.email_data, email_action_type: 'signup' },
  };
  expect((await POST(request(payload))).status).toBe(200);
  expect(mocks.locale).toHaveBeenCalledWith(base.user.id, 'pt');
  const email = mocks.send.mock.calls[0][0];
  expect(email.subject).toBe('Confirme seu e-mail — Fixture School');
  expect(email.metadata).toMatchObject({ locale: 'pt', localeSource: 'hint' });
});
it('fails retryably when recipient locale cannot be read', async () => {
  mocks.locale.mockRejectedValue(new Error('localeReadFailed'));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'locale_unavailable' });
  expect(mocks.send).not.toHaveBeenCalled();
});
it('does not fall back to defaults when the template override query fails', async () => {
  mocks.load.mockRejectedValue(new Error('loadFailed'));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'send_failed' });
  expect(mocks.send).not.toHaveBeenCalled();
});

it('rejects an oversized signed auth hook before rendering or sending email', async () => {
  const response = await POST(request({ ...base, padding: 'x'.repeat(1_048_576) }));
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: 'payload_too_large' });
  expect(mocks.settings).not.toHaveBeenCalled();
  expect(mocks.locale).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it('rejects missing auth hook signature headers before reading the body', async () => {
  const req = new Request(request().url, { method: 'POST', body: '{}' });
  const read = vi.spyOn(req.body!, 'getReader');
  expect((await POST(req)).status).toBe(401);
  expect(read).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it('returns a controlled response when the auth hook body stream fails', async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.error(new Error('fictitious interrupted upload')); },
  });
  const req = new Request(request().url, {
    method: 'POST', headers: request().headers, body: stream, duplex: 'half',
  } as RequestInit);
  const response = await POST(req);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_body' });
  expect(mocks.settings).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it('verifies the original UTF-8 bytes of a fragmented auth hook', async () => {
  const payload = { ...base, user: { ...base.user, user_metadata: { display_name: 'João 🌎' } } };
  const signed = request(payload);
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.subarray(offset, ++offset));
    },
  });
  const response = await POST(new Request(signed.url, {
    method: 'POST', headers: signed.headers, body: stream, duplex: 'half',
  } as RequestInit));
  expect(response.status).toBe(200);
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.send.mock.calls[0][0].html).toContain('João');
});
