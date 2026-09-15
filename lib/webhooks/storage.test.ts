import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), queue: vi.fn(), notify: vi.fn(), settings: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/features/Enrollment/notifications', () => ({ notifyEnrollment: mocks.notify }));
vi.mock('@/core/theme/settings', () => ({ getTenantSettings: mocks.settings }));
import { claimWebhookEvent, finishWebhookEvent } from './idempotency';
import { enqueueDeadLetter, computeNextAttemptAt, MAX_ATTEMPTS } from './dead-letter';
import { processEnrollment } from './processor';
import { renewEnrollment, revokeEnrollment } from './revoke';
const request = { provider: 'generic' as const, transactionId: 'txn-demo', email: 'member@example.test', accessLevelId: 'level-demo' };
beforeEach(() => {
  vi.resetAllMocks(); mocks.admin.mockReturnValue({ rpc: mocks.rpc, from: () => ({ insert: mocks.queue }) });
  mocks.notify.mockResolvedValue(undefined); mocks.settings.mockRejectedValue(new Error('Fictitious email transport failure'));
});
describe('payment storage failures and duplicate receipts', () => {
  it('uses all six documented retry delays before abandoning', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
    try {
      const delays = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];
      expect(delays.map((_, index) => new Date(computeNextAttemptAt(index + 1)!).getTime() - Date.now())).toEqual(delays);
      expect(computeNextAttemptAt(MAX_ATTEMPTS)).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it('fails closed on unavailable event storage', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'offline' } });
    await expect(claimWebhookEvent('generic', 'txn', 'purchase')).rejects.toThrow('Event storage unavailable');
  });
  it('never treats loss of claim ownership as completed', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(finishWebhookEvent('generic', 'txn', 'token', true)).rejects.toThrow('claim could not be finalized');
  });
  it('surfaces failed durable enqueue', async () => {
    mocks.queue.mockResolvedValue({ error: { code: 'offline' } });
    await expect(enqueueDeadLetter({ provider: 'generic', eventType: 'purchase', payload: {}, error: 'test' })).rejects.toThrow('Retry queue');
  });
  it('a duplicate receipt skips emails and notices without changing access', async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === 'get_user_id_by_email' ? 'user-demo' : { enrollment_id: 'enrollment-demo', duplicate: true }, error: null }));
    expect(await processEnrollment(request)).toMatchObject({ enrollmentId: 'enrollment-demo', duplicate: true });
    expect(mocks.settings).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('passes absolute paid period to the atomic application RPC', async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === 'get_user_id_by_email' ? 'user-demo' : { enrollment_id: 'enrollment-demo', duplicate: true }, error: null }));
    await processEnrollment({ ...request, expirationDays: 1, expiresAt: '2027-01-01T00:00:00.000Z' });
    expect(mocks.rpc).toHaveBeenCalledWith('apply_payment_enrollment', expect.objectContaining({ p_expires_at: '2027-01-01T00:00:00.000Z' }));
  });
  it('retains enrollment success when email and in-app notification fail', async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === 'get_user_id_by_email' ? 'user-demo' : { enrollment_id: 'enrollment-demo', duplicate: false }, error: null }));
    mocks.notify.mockRejectedValue(new Error('Fictitious notification failure'));
    await expect(processEnrollment(request)).resolves.toMatchObject({ enrollmentId: 'enrollment-demo' });
    expect(mocks.settings).toHaveBeenCalledOnce(); expect(mocks.notify).toHaveBeenCalledOnce();
  });
  it('cannot interpret mutation database errors as missing enrollment', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'offline' } });
    await expect(revokeEnrollment({ provider: 'generic', transactionId: 'txn', reason: 'refund' })).rejects.toThrow('mutation failed');
  });
  it('delegates renewal monotonicity to one atomic database mutation', async () => {
    mocks.rpc.mockResolvedValue({ data: { found: true, enrollmentId: 'e' }, error: null });
    await renewEnrollment({ provider: 'stripe', transactionId: 'cs-demo', expiresAt: '2027-01-01T00:00:00Z' });
    expect(mocks.rpc).toHaveBeenCalledWith('mutate_payment_enrollment', { p_provider: 'stripe', p_transaction_id: 'cs-demo', p_kind: 'renew', p_expires_at: '2027-01-01T00:00:00Z', p_reason: null });
  });
});
