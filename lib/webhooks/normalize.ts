import { asRecord, externalId, eventDate, webhookWorkSchema, type WebhookWork } from './work';

export function normalizeGeneric(payload: Record<string, unknown>): WebhookWork {
  return webhookWorkSchema.parse({ version: 1, provider: 'generic', eventId: payload.transaction_id, eventType: 'purchase',
    action: { kind: 'enroll', transactionId: payload.transaction_id, email: payload.email, name: payload.name, externalProductId: externalId(payload.product_id) ?? payload.product_id } });
}

export function guruProducerId(payload: Record<string, unknown>) {
  const product = asRecord(payload.product); const item = asRecord(Array.isArray(payload.items) ? payload.items[0] : null);
  const producers = [asRecord(product.producer), asRecord(item.producer), asRecord(payload.producer)];
  for (const producer of producers) { const id = externalId(producer.marketplace_id) ?? externalId(producer.id); if (id) return id; }
  return externalId(payload.producer_id);
}
export function normalizeGuru(payload: Record<string, unknown>): WebhookWork | null {
  const product = asRecord(payload.product); const item = asRecord(Array.isArray(payload.items) ? payload.items[0] : null);
  const contact = asRecord(payload.contact); const subscriber = asRecord(payload.subscriber); const last = asRecord(payload.last_transaction);
  const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : '';
  const isSubscription = typeof payload.webhook_type === 'string' && payload.webhook_type.toLowerCase() === 'subscription';
  // A subscription's id is not the purchase transaction id used by enrollments.
  const transactionId = isSubscription
    ? externalId(last.id) ?? externalId(payload.transaction_id)
    : externalId(payload.id) ?? externalId(payload.transaction_id) ?? externalId(last.id);
  let action: unknown; let eventType: string;
  if (['approved', 'completed', 'paid'].includes(status)) {
    eventType = 'purchase';
    action = { kind: 'enroll', transactionId, email: contact.email ?? payload.email ?? subscriber.email ?? asRecord(last.contact).email,
      name: contact.name ?? payload.name ?? subscriber.name ?? asRecord(last.contact).name,
      externalProductId: externalId(asRecord(product.offer).id) ?? externalId(product.id) ?? externalId(product.internal_id) ?? externalId(asRecord(item.offer).id) ?? externalId(item.id) ?? externalId(payload.product_id) };
  } else if (['refund', 'refunded', 'chargeback', 'charged_back'].includes(status)) {
    eventType = status.startsWith('charge') ? 'chargeback' : 'refund';
    action = { kind: 'revoke', transactionId, reason: eventType };
  } else if (isSubscription && ['canceled', 'cancelled'].includes(status)) {
    eventType = 'subscription.canceled';
    action = { kind: 'expire', transactionId, expiresAt: eventDate(payload.next_billing_date ?? payload.next_charge_date ?? payload.expires_at ?? payload.ends_at) };
  } else return null;
  return webhookWorkSchema.parse({ version: 1, provider: 'guru', eventId: `${eventType}:${transactionId ?? ''}`, eventType, action });
}

/** Legacy adapter: catalog setup remains limited to Stripe, Guru and generic. */
export function normalizeHotmart(payload: Record<string, unknown>): WebhookWork | null {
  const data = asRecord(payload.data); const buyer = asRecord(data.buyer); const purchase = asRecord(data.purchase); const subscription = asRecord(data.subscription);
  const transactionId = externalId(purchase.transaction);
  const event = typeof payload.event === 'string' ? payload.event.toUpperCase() : '';
  const status = typeof purchase.status === 'string' ? purchase.status.toLowerCase() : '';
  let action: unknown; let eventType: string;
  if (['PURCHASE_APPROVED', 'PURCHASE_COMPLETE'].includes(event) || (!event && ['approved', 'complete'].includes(status))) {
    eventType = 'purchase';
    action = { kind: 'enroll', transactionId, email: buyer.email, name: buyer.name, externalProductId: externalId(asRecord(data.product).id) };
  } else if (['PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'PURCHASE_PROTEST'].includes(event)) {
    eventType = event === 'PURCHASE_REFUNDED' ? 'refund' : event === 'PURCHASE_CHARGEBACK' ? 'chargeback' : 'dispute';
    action = { kind: 'revoke', transactionId, reason: eventType };
  } else if (['SUBSCRIPTION_CANCELLATION', 'SUBSCRIPTION_CANCELED'].includes(event)) {
    eventType = 'subscription.canceled';
    action = { kind: 'expire', transactionId, expiresAt: eventDate(subscription.date_next_charge ?? purchase.date_next_charge ?? subscription.end_date) };
  } else return null;
  return webhookWorkSchema.parse({ version: 1, provider: 'hotmart', eventId: `${eventType}:${transactionId ?? ''}`, eventType, action });
}
