import type Stripe from 'stripe';
import { stripe } from '@/core/stripe/server';
import { webhookWorkSchema, type WebhookWork } from './work';

export function stripePeriodEnd(subscription: Stripe.Subscription): string | undefined {
  const ends = subscription.items.data.map(item => item.current_period_end).filter(value => Number.isFinite(value) && value > 0);
  return ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : undefined;
}
const objectId = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;
export function stripeInvoiceSubscription(invoice: Stripe.Invoice) {
  const legacy = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  return objectId(invoice.parent?.subscription_details?.subscription) ?? objectId(legacy.subscription);
}
async function sessionFor(params: { payment_intent?: string; subscription?: string }) {
  const sessions = await stripe.checkout.sessions.list({ ...params, limit: 1 });
  if (!sessions.data[0]?.id) throw new Error('Checkout session unavailable; retry or review');
  return sessions.data[0].id;
}

async function sessionForCharge(charge: Stripe.Charge): Promise<string> {
  const paymentIntent = objectId(charge.payment_intent);
  if (!paymentIntent) throw new Error('Payment intent unavailable');
  const direct = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 1 });
  if (direct.data[0]?.id) return direct.data[0].id;
  // Subscription invoices have their own PaymentIntent, not the Checkout's.
  // Invoice Payments provides the current API's PaymentIntent -> invoice link.
  const payments = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: paymentIntent }, limit: 2 });
  if (payments.has_more || payments.data.length !== 1) throw new Error('Ambiguous or missing invoice payment; review transaction');
  const invoiceId = objectId(payments.data[0].invoice);
  if (!invoiceId) throw new Error('Invoice unavailable');
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionId = stripeInvoiceSubscription(invoice);
  if (!subscriptionId) throw new Error('Subscription unavailable for invoice refund');
  return sessionFor({ subscription: subscriptionId });
}

/** API lookups happen before claiming an event; lookup failures require provider retry (503). */
export async function normalizeStripe(event: Stripe.Event): Promise<WebhookWork | null> {
  let action: unknown;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id, { expand: ['line_items.data.price'] });
    if (session.payment_status === 'unpaid') return null;
    if (!['paid', 'no_payment_required'].includes(session.payment_status)) throw new Error('Unknown payment status');
    if (!session.line_items || session.line_items.has_more || session.line_items.data.length !== 1) {
      throw new Error('One Checkout line item is supported; review this purchase');
    }
    const item = session.line_items.data[0];
    if (!item.price?.id) throw new Error('Checkout price unavailable');
    const subscriptionId = objectId(session.subscription);
    const expiresAt = subscriptionId ? stripePeriodEnd(await stripe.subscriptions.retrieve(subscriptionId)) : undefined;
    if (subscriptionId && !expiresAt) throw new Error('Subscription period unavailable');
    action = { kind: 'enroll', transactionId: session.id, email: session.customer_details?.email ?? session.customer_email,
      name: session.customer_details?.name ?? undefined, externalProductId: item.price.id, expiresAt };
  } else if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = stripeInvoiceSubscription(invoice);
    if (!subscriptionId || invoice.billing_reason === 'subscription_create') return null;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    action = { kind: 'renew', transactionId: await sessionFor({ subscription: subscriptionId }), expiresAt: stripePeriodEnd(subscription) };
  } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    let charge: Stripe.Charge;
    if (event.type === 'charge.refunded') {
      charge = event.data.object as Stripe.Charge;
      // Partial refunds require an operator's access decision.
      if (!charge.refunded) return null;
    } else {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = objectId(dispute.charge);
      if (!chargeId) throw new Error('Dispute charge unavailable');
      charge = await stripe.charges.retrieve(chargeId);
    }
    action = { kind: 'revoke', transactionId: await sessionForCharge(charge), reason: event.type === 'charge.refunded' ? 'refund' : 'chargeback' };
  } else if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription;
    if (event.type === 'customer.subscription.updated' && !subscription.cancel_at_period_end) return null;
    action = { kind: 'expire', transactionId: await sessionFor({ subscription: subscription.id }), expiresAt: stripePeriodEnd(subscription) };
  } else return null;
  return webhookWorkSchema.parse({ version: 1, provider: 'stripe', eventId: event.id, eventType: event.type, action });
}
