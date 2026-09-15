// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { createHmac } from 'node:crypto';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rate: vi.fn(), log: vi.fn(), deliver: vi.fn(), normalizeStripe: vi.fn(), stripe: { webhooks: { constructEvent: vi.fn() } } }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('./rate-limit', () => ({ checkWebhookRateLimit: mocks.rate }));
vi.mock('./processor', () => ({ logWebhook: mocks.log }));
vi.mock('./delivery', () => ({ executeWebhookDelivery: mocks.deliver }));
vi.mock('./stripe-work', () => ({ normalizeStripe: mocks.normalizeStripe }));
vi.mock('@/core/stripe/server', () => ({ stripe: mocks.stripe }));
import { POST as generic } from '@/app/api/webhooks/generic/route';
import { POST as guru } from '@/app/api/webhooks/guru/[token]/route';
import { POST as hotmart } from '@/app/api/webhooks/hotmart/route';
import { POST as stripe } from '@/app/api/webhooks/stripe/route';
const secret = 'fictitious-webhook-secret-only';
const config = { id: 'cfg', provider: 'generic', is_active: true, secret_key: secret, access_level_id: 'level', expiration_days: null };
const sdk = new Stripe('sk_test_fictitious_local_signature_only');
function client(row: unknown = config, error: unknown = null) {
  const query = { select: () => query, eq: () => query, gt: () => query, limit: () => query, maybeSingle: async () => ({ data: row, error }) };
  mocks.admin.mockReturnValue({ from: () => query });
}
const request = (payload: unknown = { email: 'buyer@example.test', transaction_id: 'txn-demo' }, headers: Record<string, string> = { Authorization: `Bearer ${secret}` }) => new Request('http://localhost/api/webhooks/generic', { method: 'POST', body: JSON.stringify(payload), headers });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55431'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fictitious-local-only'); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fictitious');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
  client(); mocks.rate.mockResolvedValue({ allowed: true }); mocks.log.mockResolvedValue(undefined); mocks.deliver.mockResolvedValue({ status: 200, body: { received: true } });
  mocks.stripe.webhooks.constructEvent.mockImplementation((body: Buffer, signature: string, secret: string) => sdk.webhooks.constructEvent(body, signature, secret));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('webhook HTTP boundaries without external traffic', () => {
  it('rejects oversized streamed JSON before consuming the entire upload', async () => {
    let chunksRead = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunksRead === 4) return controller.close();
        chunksRead++;
        controller.enqueue(new Uint8Array(524_288).fill(32));
      },
      cancel,
    }, { highWaterMark: 0 });
    const input = new Request('http://localhost/api/webhooks/generic', {
      method: 'POST', body, headers: { authorization: `Bearer ${secret}` }, duplex: 'half',
    } as RequestInit);
    const response = await generic(input);
    expect(response.status).toBe(413);
    expect(chunksRead).toBe(3);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('rejects an invalid bearer token without reading the body', async () => {
    const pull = vi.fn(controller => controller.close());
    const body = new ReadableStream<Uint8Array>({ pull }, { highWaterMark: 0 });
    const input = new Request('http://localhost/api/webhooks/generic', {
      method: 'POST', body, headers: { authorization: 'Bearer incorrect' }, duplex: 'half',
    } as RequestInit);
    expect((await generic(input)).status).toBe(401);
    expect(pull).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it.each(['generic', 'guru', 'hotmart', 'stripe'] as const)('%s returns 413 without rate checks or delivery for excess bytes', async provider => {
    client({ ...config, provider });
    const input = new Request(`http://localhost/api/webhooks/${provider}`, {
      method: 'POST', body: 'x'.repeat(1_048_577),
      headers: { authorization: `Bearer ${secret}`, 'x-hotmart-hottok': secret, 'stripe-signature': 'present' },
    });
    const handlers = { generic, hotmart, stripe, guru: (request: Request) => guru(request, { params: Promise.resolve({ token: secret }) }) };
    const response = await handlers[provider](input);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Payload too large' });
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.stripe.webhooks.constructEvent).not.toHaveBeenCalled();
  });
  it.each(['generic', 'guru', 'hotmart', 'stripe'] as const)('%s returns 400 for a broken body stream without processing', async provider => {
    client({ ...config, provider });
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('upload interrupted')); } });
    const input = new Request(`http://localhost/api/webhooks/${provider}`, {
      method: 'POST', body, duplex: 'half',
      headers: { authorization: `Bearer ${secret}`, 'x-hotmart-hottok': secret, 'stripe-signature': 'present' },
    } as RequestInit);
    const handlers = { generic, hotmart, stripe, guru: (request: Request) => guru(request, { params: Promise.resolve({ token: secret }) }) };
    expect((await handlers[provider](input)).status).toBe(400);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it.each(['guru', 'hotmart'] as const)('%s rejects an invalid token before reading JSON', async provider => {
    client({ ...config, provider });
    const input = request(null, { 'x-hotmart-hottok': 'incorrect' });
    const read = vi.spyOn(input, 'body', 'get');
    const response = provider === 'guru'
      ? await guru(input, { params: Promise.resolve({ token: 'incorrect-valid-format-token' }) })
      : await hotmart(input);
    expect(response.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it.each([null, [], 'text'])('rejects non-object JSON %j', async value => {
    expect((await generic(request(value))).status).toBe(400); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it.each(['', 'Bearer wrong', `Bearer ${'é'.repeat(secret.length)}`])('rejects missing, wrong or multibyte tokens without throwing', async authorization => {
    expect((await generic(request({}, { authorization }))).status).toBe(401); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('delivers a validated generic purchase', async () => {
    expect((await generic(request())).status).toBe(200); expect(mocks.deliver).toHaveBeenCalledWith(expect.objectContaining({ version: 1, action: expect.objectContaining({ transactionId: 'txn-demo' }) }), config);
  });
  it('rejects malformed purchase fields before effects', async () => {
    expect((await generic(request({ email: [], transaction_id: 4 }))).status).toBe(400); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('responds predictably before initializing an unconfigured database', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', ''); expect((await generic(request())).status).toBe(503); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('exposes unavailable configuration as retryable, not an absent config', async () => {
    client(null, { message: 'offline' }); expect((await generic(request())).status).toBe(503);
  });
  it('rejects ambiguous active configurations instead of choosing one offer', async () => {
    client(null, { code: 'PGRST116', message: 'More than one row' });
    expect((await generic(request())).status).toBe(503); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('rate limiting does not claim or process the event', async () => {
    mocks.rate.mockResolvedValue({ allowed: false, retryAfter: 60 }); expect((await generic(request())).status).toBe(429); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('test ping authenticates without enrolling or claiming an event', async () => {
    expect((await generic(request({}, { Authorization: `Bearer ${secret}`, 'X-Test-Mode': '1' }))).status).toBe(200); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('Guru filter syntax is rejected before any database request', async () => {
    expect((await guru(request(), { params: Promise.resolve({ token: 'x,secret_key.neq.null' }) })).status).toBe(401); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('Guru rejects another producer even with a valid token', async () => {
    client({ ...config, provider: 'guru', expected_producer_id: 'demo-producer' });
    expect((await guru(request({ status: 'approved', producer_id: 'other' }), { params: Promise.resolve({ token: secret }) })).status).toBe(401); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('Hotmart never stores the body credential in retry work', async () => {
    client({ ...config, provider: 'hotmart' });
    expect((await hotmart(request({ hottok: secret, event: 'PURCHASE_APPROVED', data: { buyer: { email: 'buyer@example.test' }, purchase: { transaction: 'txn' } } }, {}))).status).toBe(200);
    expect(JSON.stringify(mocks.deliver.mock.calls[0][0])).not.toContain(secret);
  });
  it('Stripe rejects an invalid signature before API calls or delivery', async () => {
    client({ ...config, provider: 'stripe' });
    expect((await stripe(request({}, { 'stripe-signature': 'bad-signature' }))).status).toBe(400); expect(mocks.normalizeStripe).not.toHaveBeenCalled(); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('Stripe verifies a locally signed payload before its test ping', async () => {
    client({ ...config, provider: 'stripe' }); const payload = JSON.stringify({ id: 'evt-demo', type: 'test.event', data: { object: {} } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
    const response = await stripe(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': signature, 'X-Test-Mode': '1' } }));
    expect(response.status).toBe(200); expect((await response.json()).testMode).toBe(true); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it('Stripe verifies the exact fragmented UTF-8 bytes without padding or JSON normalization', async () => {
    client({ ...config, provider: 'stripe' });
    const payload = ' { "id": "evt-demo", "type": "test.event", "data": { "object": { "name": "ação 🎓" } } }\n';
    const bytes = Buffer.from(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(bytes).digest('hex')}`;
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) return controller.close();
        controller.enqueue(bytes.subarray(offset, ++offset));
      },
    });
    const response = await stripe(new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST', body, headers: { 'stripe-signature': signature, 'X-Test-Mode': '1' }, duplex: 'half',
    } as RequestInit));
    expect(response.status).toBe(200);
    expect(mocks.stripe.webhooks.constructEvent.mock.calls[0][0]).toEqual(bytes);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});
