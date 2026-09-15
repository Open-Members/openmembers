import { z } from 'zod';
const identifier = z.string().trim().min(1).max(255);
const transaction = { transactionId: identifier };
const expiry = z.iso.datetime({ offset: true });
export const webhookWorkSchema = z.object({
  version: z.literal(1),
  provider: z.enum(['stripe', 'guru', 'generic', 'hotmart']),
  eventId: identifier,
  eventType: identifier,
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('enroll'), ...transaction, email: z.email().max(254), name: z.string().trim().max(200).optional(), externalProductId: identifier.nullable().optional(), expiresAt: expiry.nullable().optional() }),
    z.object({ kind: z.literal('revoke'), ...transaction, reason: z.enum(['refund', 'chargeback', 'dispute', 'cancelled', 'fraud']) }),
    z.object({ kind: z.literal('expire'), ...transaction, expiresAt: expiry }),
    z.object({ kind: z.literal('renew'), ...transaction, expiresAt: expiry }),
  ]),
});
export type WebhookWork = z.infer<typeof webhookWorkSchema>;
export interface PaymentWebhookConfig {
  id: string;
  provider: WebhookWork['provider'];
  access_level_id: string | null;
  expiration_days: number | null;
  is_active: boolean;
  secret_key: string;
  previous_secret_key?: string | null;
  previous_secret_expires_at?: string | null;
  expected_producer_id?: string | null;
}
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function externalId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
}
export function eventDate(value: unknown): string | undefined {
  const date = typeof value === 'number' && Number.isFinite(value)
    ? new Date(value < 1e12 ? value * 1000 : value)
    : typeof value === 'string' ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
