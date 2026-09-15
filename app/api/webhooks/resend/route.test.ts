// @vitest-environment node
import { createHmac } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), insert: vi.fn() }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
import { POST } from './route';
const key = Buffer.from('fictitious-resend-signature-fixture');
const base = { type: 'email.delivered', created_at: '2026-09-11T12:00:00Z', data: { email_id: 'fixture-id', to: ['student@example.test'], tags: [{ name: 'other', value: 'ignored' }, { name: 'category', value: 'fixture' }] } };
function request(payload: unknown = base, version = 'v1', age = 0, id = 'fixture-event-id') {
  const body = JSON.stringify(payload); const ts = String(Math.floor(Date.now() / 1000) - age);
  const signature = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return new Request('https://academy.example.test/api/webhooks/resend', { method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `${version},${signature}` } });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_WEBHOOK_SECRET', `whsec_${key.toString('base64')}`); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55431'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture'); mocks.insert.mockReset().mockResolvedValue({ error: null }); mocks.admin.mockReturnValue({ from: () => ({ insert: mocks.insert }) });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('signed delivery stores a stable UUID and picks the category tag', async () => {
  expect((await POST(request())).status).toBe(200); expect((await POST(request())).status).toBe(200);
  expect(mocks.insert.mock.calls[0][0]).toMatchObject({ id: mocks.insert.mock.calls[1][0].id, tag: 'fixture', event_type: 'delivered' });
});
it('duplicate primary key is acknowledged, other insert failures are retryable', async () => {
  mocks.insert.mockResolvedValueOnce({ error: { code: '23505' } }).mockResolvedValueOnce({ error: { code: '08000', message: 'private detail' } });
  expect(await (await POST(request())).json()).toMatchObject({ duplicate: true });
  const response = await POST(request()); expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: 'event_write_failed' });
});
it.each([null, { ...base, created_at: 'invalid' }, { ...base, data: { email_id: 'fixture', to: 'not-an-email' } }])('malformed signed event returns 400 without database writes', async payload => {
  expect((await POST(request(payload))).status).toBe(400); expect(mocks.insert).not.toHaveBeenCalled();
});
it.each([['v2', 0], ['v1', 301], ['v1', -301]])('invalid signature/replay %s %i never writes', async (version, age) => {
  expect((await POST(request(base, String(version), Number(age)))).status).toBe(401); expect(mocks.insert).not.toHaveBeenCalled();
});
it('delayed delivery is not a hard failure', async () => {
  expect(await (await POST(request({ ...base, type: 'email.delivery_delayed' }))).json()).toMatchObject({ eventType: 'delayed', isHardFail: false });
});
it('rejects a signed payload over 1 MiB before writing an event', async () => {
  const response = await POST(request({ ...base, padding: 'a'.repeat(1_048_576) }));
  expect(response.status).toBe(413);
  expect(mocks.insert).not.toHaveBeenCalled();
});
it('verifies fragmented UTF-8 and the BOM as received before decoding JSON', async () => {
  const bytes = Buffer.from(`\uFEFF ${JSON.stringify({ ...base, data: { ...base.data, subject: 'ação 🎓' } })}\n`);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', key).update(`fixture.${timestamp}.`).update(bytes).digest('base64');
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, ++offset));
    },
  });
  const response = await POST(new Request('https://academy.example.test/api/webhooks/resend', {
    method: 'POST', body, duplex: 'half',
    headers: { 'svix-id': 'fixture', 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
  } as RequestInit));
  expect(response.status).toBe(200);
  expect(mocks.insert.mock.calls[0][0]).toMatchObject({ subject: 'ação 🎓' });
});
it('rejects missing signature headers without reading the body or initializing the database', async () => {
  const input = new Request('https://academy.example.test/api/webhooks/resend', { method: 'POST', body: 'invalid' });
  const read = vi.spyOn(input, 'body', 'get');
  expect((await POST(input)).status).toBe(401);
  expect(read).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
});
it('returns 400 for a failed body read without writing', async () => {
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('upload interrupted')); } });
  const input = new Request('https://academy.example.test/api/webhooks/resend', { method: 'POST', body, duplex: 'half', headers: request().headers } as RequestInit);
  expect((await POST(input)).status).toBe(400);
  expect(mocks.insert).not.toHaveBeenCalled();
});
