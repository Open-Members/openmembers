import { normalizeGeneric } from '@/lib/webhooks/normalize';
import { executeWebhookDelivery } from '@/lib/webhooks/delivery';
import { getPaymentConfig, hasPaymentDatabase, invalidWebhookBodyResponse, paymentPreflight, readWebhookJson, secretMatches, unavailablePaymentResponse } from '@/lib/webhooks/http';

export async function POST(request: Request) {
  if (!hasPaymentDatabase()) return unavailablePaymentResponse();
  try {
    const config = await getPaymentConfig('generic');
    if (!config) return Response.json({ error: 'Webhook not configured' }, { status: 404 });
    const header = request.headers.get('authorization');
    if (!secretMatches(header?.startsWith('Bearer ') ? header.slice(7) : null, config.secret_key)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    let payload: Record<string, unknown>;
    try { payload = await readWebhookJson(request); } catch (error) { return invalidWebhookBodyResponse(error); }
    const preflight = await paymentPreflight(request, config);
    if (preflight) return preflight;
    let work;
    try { work = normalizeGeneric(payload); } catch { return Response.json({ error: 'Invalid email, transaction_id or product fields' }, { status: 400 }); }
    const result = await executeWebhookDelivery(work, config);
    return Response.json(result.body, { status: result.status });
  } catch { return unavailablePaymentResponse(); }
}
