import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ claim: vi.fn(), finish: vi.fn(), queue: vi.fn(), enroll: vi.fn(), revoke: vi.fn(), expire: vi.fn(), renew: vi.fn(), log: vi.fn() }));
vi.mock('./idempotency', () => ({ claimWebhookEvent: mocks.claim, finishWebhookEvent: mocks.finish }));
vi.mock('./dead-letter', () => ({ enqueueDeadLetter: mocks.queue }));
vi.mock('./processor', () => ({ processEnrollment: mocks.enroll, logWebhook: mocks.log }));
vi.mock('./revoke', () => ({ revokeEnrollment: mocks.revoke, scheduleEnrollmentExpiry: mocks.expire, renewEnrollment: mocks.renew }));
import { executeWebhookDelivery } from './delivery';
import type { PaymentWebhookConfig, WebhookWork } from './work';
const config: PaymentWebhookConfig = { id: 'config', provider: 'generic', is_active: true, secret_key: 'fictional-test-token', access_level_id: 'level', expiration_days: 10 };
const work: WebhookWork = { version: 1, provider: 'generic', eventId: 'txn', eventType: 'purchase', action: { kind: 'enroll', transactionId: 'txn', email: 'member@example.test' } };
beforeEach(() => {
  vi.resetAllMocks(); mocks.claim.mockResolvedValue({ state: 'claimed', token: 'owner' }); mocks.finish.mockResolvedValue(undefined);
  mocks.queue.mockResolvedValue(undefined); mocks.enroll.mockResolvedValue({}); mocks.log.mockResolvedValue(undefined);
  for (const fn of [mocks.revoke, mocks.expire, mocks.renew]) fn.mockResolvedValue({ found: true });
});
describe('durable payment delivery', () => {
  it('completes only after the effect succeeds', async () => {
    expect((await executeWebhookDelivery(work, config)).status).toBe(200);
    expect(mocks.finish).toHaveBeenCalledWith('generic', 'txn', 'owner', true);
    expect(mocks.enroll.mock.invocationCallOrder[0]).toBeLessThan(mocks.finish.mock.invocationCallOrder[0]);
  });
  it.each(['processed', 'busy'])('does not repeat effects for %s claims', async state => {
    mocks.claim.mockResolvedValue({ state }); const result = await executeWebhookDelivery(work, config);
    expect(result.status).toBe(state === 'processed' ? 200 : 503); expect(mocks.enroll).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('does not process when the claim store fails', async () => {
    mocks.claim.mockRejectedValue(new Error('offline'));
    expect((await executeWebhookDelivery(work, config)).status).toBe(503); expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it('only acknowledges recoverable failure after normalized work is persisted', async () => {
    mocks.enroll.mockRejectedValue(new Error('temporary outage'));
    expect((await executeWebhookDelivery(work, config)).status).toBe(202);
    expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({ payload: work, webhookConfigId: config.id }));
    expect(mocks.finish).toHaveBeenCalledWith('generic', 'txn', 'owner', false);
  });
  it('returns a retryable error if durable queue insertion fails', async () => {
    mocks.enroll.mockRejectedValue(new Error('offline')); mocks.queue.mockRejectedValue(new Error('offline'));
    expect((await executeWebhookDelivery(work, config)).status).toBe(503);
  });
  it('a cron failure reschedules its existing job instead of adding duplicates', async () => {
    mocks.enroll.mockRejectedValue(new Error('offline'));
    expect((await executeWebhookDelivery(work, config, { enqueueOnFailure: false })).status).toBe(503);
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('retains work when event completion fails after enrollment', async () => {
    mocks.finish.mockRejectedValueOnce(new Error('completion lost'));
    expect((await executeWebhookDelivery(work, config)).status).toBe(202);
    expect(mocks.queue).toHaveBeenCalledOnce();
  });
  it('does not retry completed access when audit logging fails', async () => {
    mocks.log.mockRejectedValue(new Error('audit unavailable'));
    expect((await executeWebhookDelivery(work, config)).status).toBe(200); expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('retries a refund received before its purchase enrollment', async () => {
    mocks.revoke.mockResolvedValue({ found: false });
    const result = await executeWebhookDelivery({ ...work, eventId: 'refund:txn', action: { kind: 'revoke', transactionId: 'txn', reason: 'refund' } }, config);
    expect(result.status).toBe(202); expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it.each(['expire', 'renew'] as const)('routes %s through its explicit action', async kind => {
    const expiresAt = '2027-01-01T00:00:00.000Z';
    expect((await executeWebhookDelivery({ ...work, action: { kind, transactionId: 'txn', expiresAt } }, config)).status).toBe(200);
    expect(kind === 'expire' ? mocks.expire : mocks.renew).toHaveBeenCalledWith(expect.objectContaining({ expiresAt }));
  });
  it.each([{ ...config, is_active: false }, { ...config, provider: 'guru' as const }])('rejects inactive or mismatched configurations', async current => {
    expect((await executeWebhookDelivery(work, current)).status).toBe(503); expect(mocks.claim).not.toHaveBeenCalled();
  });
});
