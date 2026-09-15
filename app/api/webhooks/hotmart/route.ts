import { normalizeHotmart } from '@/lib/webhooks/normalize';
import { executeWebhookDelivery } from '@/lib/webhooks/delivery';
import { getPaymentConfig, hasPaymentDatabase, invalidWebhookBodyResponse, paymentPreflight, readWebhookJson, secretMatches, unavailablePaymentResponse } from '@/lib/webhooks/http';

/** Compatibility endpoint; Hotmart is not offered as a supported setup in the catalog. */
export async function POST(request: Request) {
  if (!hasPaymentDatabase()) return unavailablePaymentResponse();
  try {
    const config = await getPaymentConfig('hotmart');
    if (!config) return Response.json({ error: 'Webhook not configured' }, { status: 404 });
    const headerToken = request.headers.get('x-hotmart-hottok');
    if (headerToken && !secretMatches(headerToken, config.secret_key)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    let payload: Record<string, unknown>;
    try { payload = await readWebhookJson(request); } catch (error) { return invalidWebhookBodyResponse(error); }
    const token = headerToken || (typeof payload.hottok === 'string' ? payload.hottok : null);
    if (!secretMatches(token, config.secret_key)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // Never retain body credentials. Old timestamps are legitimate on provider retries;
    // deduplication uses persisted transaction/event identity rather than event age.
    delete payload.hottok;
    const preflight = await paymentPreflight(request, config); if (preflight) return preflight;
    let work;
    try { work = normalizeHotmart(payload); } catch { return Response.json({ error: 'Invalid purchase or cancellation fields' }, { status: 400 }); }
    if (!work) return Response.json({ received: true, skipped: true });
    const result = await executeWebhookDelivery(work, config);
    return Response.json(result.body, { status: result.status });
  } catch { return unavailablePaymentResponse(); }
}
