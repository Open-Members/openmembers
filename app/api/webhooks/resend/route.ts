import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/core/supabase/admin';
import { verifyEmailSignature } from '@/lib/services/email/signature';
import { readLimitedRequestBody, RequestBodyTooLargeError } from '@/lib/http/request-body';

const eventSchema = z.object({
  type: z.string().startsWith('email.').max(80),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({
    email_id: z.string().min(1).max(200), to: z.union([z.array(z.email()).min(1), z.email()]),
    subject: z.string().max(2000).optional(),
    bounce: z.object({ type: z.string().optional(), message: z.string().optional() }).optional(),
    complaint: z.object({ message: z.string().optional() }).optional(),
    tags: z.union([z.array(z.object({ name: z.string(), value: z.string() })), z.record(z.string(), z.string())]).optional(),
  }).passthrough(),
}).passthrough();
const eventTypes: Record<string, string> = {
  'email.delivered': 'delivered', 'email.sent': 'sent', 'email.complained': 'spam',
  'email.delivery_delayed': 'delayed', 'email.opened': 'opened', 'email.clicked': 'clicked',
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!['svix-id', 'svix-timestamp', 'svix-signature'].every(header => request.headers.get(header))) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }
  let rawBody: Uint8Array;
  try { rawBody = await readLimitedRequestBody(request); }
  catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyTooLargeError ? 'payload_too_large' : 'invalid_body' }, { status: error instanceof RequestBodyTooLargeError ? 413 : 400 });
  }
  if (!verifyEmailSignature(rawBody, request.headers, secret, 'svix')) return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  let input: unknown;
  try { input = JSON.parse(new TextDecoder().decode(rawBody)); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  const payload = parsed.data;
  const { data, type } = payload;
  const eventType = type === 'email.bounced' ? (data.bounce?.type === 'soft' ? 'soft_bounce' : 'hard_bounce') : eventTypes[type] ?? type;
  // Use the existing UUID primary key to make repeated signed deliveries atomic.
  const hash = createHash('sha256').update(`resend/${request.headers.get('svix-id')}`).digest('hex').slice(0, 32);
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
  const tag = Array.isArray(data.tags) ? data.tags.find(tag => tag.name === 'category')?.value : data.tags?.category;
  try {
    const { error } = await createAdminClient().from('email_events').insert({
      id, provider: 'resend', event_type: eventType, email: Array.isArray(data.to) ? data.to[0] : data.to,
      subject: data.subject ?? null, reason: data.bounce?.message ?? data.bounce?.type ?? data.complaint?.message ?? null,
      message_id: data.email_id, tag: tag ?? null, raw: payload, occurred_at: payload.created_at,
    });
    if (error && error.code !== '23505') return NextResponse.json({ error: 'event_write_failed' }, { status: 500 });
    return NextResponse.json({ received: true, duplicate: error?.code === '23505', eventType, isHardFail: ['hard_bounce', 'spam'].includes(eventType) });
  } catch { return NextResponse.json({ error: 'event_write_failed' }, { status: 500 }); }
}
