import type Stripe from 'stripe';
import { stripe } from '@/core/stripe/server';
import { readLimitedRequestBody, RequestBodyTooLargeError } from '@/lib/http/request-body';
import { executeWebhookDelivery } from '@/lib/webhooks/delivery';
import { getPaymentConfig, hasPaymentDatabase, paymentPreflight, unavailablePaymentResponse } from '@/lib/webhooks/http';
import { normalizeStripe } from '@/lib/webhooks/stripe-work';

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return Response.json({ error: 'Missing signature' }, { status: 400 });
  if (!hasPaymentDatabase() || !process.env.STRIPE_SECRET_KEY?.trim()) return unavailablePaymentResponse();
  try {
    const config = await getPaymentConfig('stripe');
    if (!config) return Response.json({ error: 'Webhook not configured' }, { status: 404 });
    const secret = config.secret_key?.length >= 16 ? config.secret_key : process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return unavailablePaymentResponse();
    let body: Uint8Array;
    try { body = await readLimitedRequestBody(request); }
    catch (error) {
      return Response.json({ error: error instanceof RequestBodyTooLargeError ? 'Payload too large' : 'Invalid body' }, { status: error instanceof RequestBodyTooLargeError ? 413 : 400 });
    }
    let event: Stripe.Event;
    try { event = stripe.webhooks.constructEvent(Buffer.from(body.buffer, body.byteOffset, body.byteLength), signature, secret); }
    catch { return Response.json({ error: 'Invalid signature' }, { status: 400 }); }
    // Authenticate and rate-limit before an event can acquire a processing claim.
    const preflight = await paymentPreflight(request, config); if (preflight) return preflight;
    const work = await normalizeStripe(event);
    if (!work) return Response.json({ received: true, skipped: true });
    const result = await executeWebhookDelivery(work, config);
    return Response.json(result.body, { status: result.status });
  } catch { return unavailablePaymentResponse(); }
}
