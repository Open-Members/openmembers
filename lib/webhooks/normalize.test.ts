import { describe, expect, it } from 'vitest';
import { guruProducerId, normalizeGeneric, normalizeGuru, normalizeHotmart } from './normalize';
import { eventDate, webhookWorkSchema } from './work';
const buyer = { email: 'member@example.test', name: 'Example Member' };

describe('normalized payment work', () => {
  it('validates generic purchases and converts numeric product identifiers', () => {
    expect(normalizeGeneric({ ...buyer, transaction_id: 'txn-1', product_id: 12 }).action).toMatchObject({ kind: 'enroll', transactionId: 'txn-1', externalProductId: '12' });
  });
  it.each([{ email: {} }, { email: 'broken' }, { transaction_id: [] }, { transaction_id: '' }, { name: 42 }, { product_id: {} }])('rejects malformed generic fields %j', (patch) => {
    expect(() => normalizeGeneric({ ...buyer, transaction_id: 'txn', ...patch })).toThrow();
  });
  it('normalizes nested Guru contact, numeric transaction and offer ID for retry', () => {
    const work = normalizeGuru({ id: 99, status: 'approved', contact: buyer, product: { id: 123, offer: { id: 'offer-demo' } } });
    expect(work).toMatchObject({ eventId: 'purchase:99', action: { email: buyer.email, transactionId: '99', externalProductId: 'offer-demo' } });
    expect(webhookWorkSchema.safeParse(JSON.parse(JSON.stringify(work))).success).toBe(true);
  });
  it('gives equivalent purchase statuses the same Guru event key', () => {
    expect(['paid', 'approved', 'completed'].map(status => normalizeGuru({ status, transaction_id: 'txn', ...buyer })?.eventId)).toEqual(['purchase:txn', 'purchase:txn', 'purchase:txn']);
  });
  it('keeps Guru purchase and refund independent', () => {
    expect(normalizeGuru({ status: 'refunded', transaction_id: 'txn' })).toMatchObject({ eventId: 'refund:txn', action: { kind: 'revoke', reason: 'refund' } });
  });
  it('requires a valid paid-through date for cancellation without prematurely revoking', () => {
    expect(() => normalizeGuru({ status: 'cancelled', webhook_type: 'subscription', transaction_id: 'txn' })).toThrow();
    expect(normalizeGuru({ status: 'cancelled', webhook_type: 'subscription', transaction_id: 'txn', ends_at: '2027-01-01T00:00:00Z' })?.action.kind).toBe('expire');
  });
  it('uses last_transaction instead of a Guru subscription id for cancellation', () => {
    const work = normalizeGuru({ id: 'subscription-demo', webhook_type: 'subscription', status: 'cancelled', last_transaction: { id: 'transaction-demo' }, ends_at: '2027-01-01T00:00:00Z' });
    expect(work?.action.transactionId).toBe('transaction-demo');
  });
  it('treats producer ID as a consistency field', () => {
    expect(guruProducerId({ product: { producer: { marketplace_id: 17, id: 42 } } })).toBe('17');
  });
  it('ignores unknown events without granting access', () => {
    expect(normalizeGuru({ status: 'pending', ...buyer })).toBeNull();
    expect(normalizeHotmart({ event: 'CART_ABANDONED' })).toBeNull();
  });
  it('Hotmart approval and completion share a purchase key and omit body token', () => {
    const payload = { hottok: 'fictional-private-token', data: { buyer, purchase: { transaction: 'txn' }, product: { id: 10 } } };
    const approved = normalizeHotmart({ ...payload, event: 'PURCHASE_APPROVED' });
    const completed = normalizeHotmart({ ...payload, event: 'PURCHASE_COMPLETE' });
    expect(approved).toEqual(completed);
    expect(JSON.stringify(approved)).not.toContain('hottok');
    expect(JSON.stringify(approved)).not.toContain(payload.hottok);
  });
  it('normalizes second/millisecond date values and rejects overflow', () => {
    expect(eventDate(1_800_000_000)).toBe(eventDate(1_800_000_000_000));
    expect(eventDate(Number.MAX_VALUE)).toBeUndefined();
  });
});
