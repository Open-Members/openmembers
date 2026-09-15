import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
const mocks = vi.hoisted(() => ({ session: vi.fn(), sessions: vi.fn(), subscription: vi.fn(), charge: vi.fn(), invoicePayments: vi.fn(), invoice: vi.fn() }));
vi.mock('@/core/stripe/server', () => ({ stripe: { checkout: { sessions: { retrieve: mocks.session, list: mocks.sessions } }, subscriptions: { retrieve: mocks.subscription }, charges: { retrieve: mocks.charge }, invoicePayments: { list: mocks.invoicePayments }, invoices: { retrieve: mocks.invoice } } }));
import { normalizeStripe, stripeInvoiceSubscription } from './stripe-work';
const event = (type: string, object: unknown) => ({ id: 'evt-demo', type, data: { object } }) as Stripe.Event;
const subscription = { id: 'sub-demo', items: { data: [{ current_period_end: 1_800_000_000 }] } };
beforeEach(() => {
  vi.resetAllMocks(); mocks.invoicePayments.mockResolvedValue({ data: [] }); mocks.sessions.mockResolvedValue({ data: [{ id: 'cs-demo' }] }); mocks.subscription.mockResolvedValue(subscription);
  mocks.session.mockResolvedValue({ id: 'cs-demo', payment_status: 'paid', customer_details: { email: 'member@example.test' }, line_items: { has_more: false, data: [{ price: { id: 'price-demo' } }] } });
});
describe('Stripe normalized contract with mocked API', () => {
  it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])('fulfills paid %s', async type => {
    expect(await normalizeStripe(event(type, { id: 'cs-demo' }))).toMatchObject({ provider: 'stripe', eventId: 'evt-demo', action: { kind: 'enroll', transactionId: 'cs-demo', externalProductId: 'price-demo' } });
  });
  it('does not grant an unpaid completed Checkout', async () => {
    mocks.session.mockResolvedValue({ payment_status: 'unpaid' }); expect(await normalizeStripe(event('checkout.session.completed', { id: 'cs-demo' }))).toBeNull();
  });
  it('does not fall back to a broad offer after a Stripe API lookup failure', async () => {
    mocks.session.mockRejectedValue(new Error('API unavailable'));
    await expect(normalizeStripe(event('checkout.session.completed', { id: 'cs-demo' }))).rejects.toThrow('API unavailable');
  });
  it('rejects multi-item Checkout instead of silently granting its first item', async () => {
    mocks.session.mockResolvedValue({ payment_status: 'paid', line_items: { data: [{ price: { id: 'a' } }, { price: { id: 'b' } }] } });
    await expect(normalizeStripe(event('checkout.session.completed', {}))).rejects.toThrow('One Checkout');
  });
  it('sets the first subscription enrollment to the paid period end', async () => {
    const current = await mocks.session(); mocks.session.mockResolvedValue({ ...current, subscription: 'sub-demo' });
    expect((await normalizeStripe(event('checkout.session.completed', {})))?.action).toMatchObject({ expiresAt: new Date(1_800_000_000_000).toISOString() });
  });
  it('reads current and legacy subscription references', () => {
    expect(stripeInvoiceSubscription({ parent: { subscription_details: { subscription: 'sub-new' } } } as Stripe.Invoice)).toBe('sub-new');
    expect(stripeInvoiceSubscription({ subscription: { id: 'sub-old' } } as unknown as Stripe.Invoice)).toBe('sub-old');
  });
  it('normalizes renewal into an absolute expiry', async () => {
    expect((await normalizeStripe(event('invoice.payment_succeeded', { billing_reason: 'subscription_cycle', parent: { subscription_details: { subscription: 'sub-demo' } } })))?.action).toMatchObject({ kind: 'renew', transactionId: 'cs-demo', expiresAt: new Date(1_800_000_000_000).toISOString() });
  });
  it('does not run first invoice twice', async () => {
    expect(await normalizeStripe(event('invoice.payment_succeeded', { billing_reason: 'subscription_create', parent: { subscription_details: { subscription: 'sub-demo' } } }))).toBeNull();
    expect(mocks.subscription).not.toHaveBeenCalled();
  });
  it('leaves partial refunds for an explicit operator decision', async () => {
    expect(await normalizeStripe(event('charge.refunded', { refunded: false, payment_intent: 'pi-demo' }))).toBeNull();
    expect(mocks.sessions).not.toHaveBeenCalled();
  });
  it('revokes full refunds using the original Checkout transaction', async () => {
    expect((await normalizeStripe(event('charge.refunded', { refunded: true, payment_intent: { id: 'pi-demo' } })))?.action).toEqual({ kind: 'revoke', transactionId: 'cs-demo', reason: 'refund' });
  });
  it.each(['charge.refunded', 'charge.dispute.created'])('resolves subscription %s through Invoice Payments', async type => {
    mocks.sessions.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [{ id: 'cs-subscription' }] });
    mocks.invoicePayments.mockResolvedValue({ data: [{ invoice: 'in-renewal' }], has_more: false });
    mocks.invoice.mockResolvedValue({ parent: { subscription_details: { subscription: 'sub-demo' } } });
    mocks.charge.mockResolvedValue({ payment_intent: 'pi-renewal' });
    const object = type === 'charge.refunded' ? { refunded: true, payment_intent: 'pi-renewal' } : { charge: 'ch-renewal' };
    expect((await normalizeStripe(event(type, object)))?.action).toMatchObject({ kind: 'revoke', transactionId: 'cs-subscription' });
    expect(mocks.invoicePayments).toHaveBeenCalledWith({ payment: { type: 'payment_intent', payment_intent: 'pi-renewal' }, limit: 2 });
  });
  it('keeps unresolved refund transactions retryable', async () => {
    mocks.sessions.mockResolvedValue({ data: [] });
    await expect(normalizeStripe(event('charge.refunded', { refunded: true, payment_intent: 'pi-demo' }))).rejects.toThrow('Ambiguous or missing invoice payment');
  });
});
