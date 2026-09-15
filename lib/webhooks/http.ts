import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/core/supabase/admin';
import { readLimitedRequestBody, RequestBodyTooLargeError } from '@/lib/http/request-body';
import { checkWebhookRateLimit } from './rate-limit';
import { logWebhook } from './processor';
import type { PaymentWebhookConfig, WebhookWork } from './work';

export function hasPaymentDatabase() {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}
export function secretMatches(value: string | null, secret: string | null | undefined) {
  if (!value || !secret || secret.length < 16) return false;
  const a = Buffer.from(value); const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function readWebhookJson(request: Request): Promise<Record<string, unknown>> {
  const body = new TextDecoder().decode(await readLimitedRequestBody(request));
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected JSON object');
  return parsed as Record<string, unknown>;
}
export function invalidWebhookBodyResponse(error: unknown) {
  return error instanceof RequestBodyTooLargeError
    ? Response.json({ error: 'Payload too large' }, { status: 413 })
    : Response.json({ error: 'Invalid JSON object' }, { status: 400 });
}
export async function getPaymentConfig(provider: WebhookWork['provider']): Promise<PaymentWebhookConfig | null> {
  // At most one account per endpoint. Reading two makes maybeSingle reject ambiguity.
  const { data, error } = await createAdminClient().from('webhook_configs').select('*')
    .eq('provider', provider).eq('is_active', true).limit(2).maybeSingle();
  if (error) throw new Error('Webhook configuration unavailable');
  return data;
}
export async function paymentPreflight(request: Request, config: PaymentWebhookConfig): Promise<Response | null> {
  const rate = await checkWebhookRateLimit(config.id);
  if (!rate.allowed) return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfter ?? 60) } });
  if (request.headers.get('X-Test-Mode') === '1') {
    await logWebhook({ webhookConfigId: config.id, provider: config.provider, eventType: 'test.ping', payload: {}, status: 'received' });
    return Response.json({ ok: true, testMode: true, provider: config.provider, configId: config.id, message: 'Webhook reachable and authentication verified.' });
  }
  return null;
}
export function unavailablePaymentResponse() {
  return Response.json({ error: 'Webhook unavailable; retry later' }, { status: 503, headers: { 'Retry-After': '60' } });
}
