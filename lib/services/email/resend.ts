import { createAdminClient } from '@/core/supabase/admin';
import { getTenantSettings } from '@/core/theme/settings';
import { getEmailTransport } from './config';

export interface SendTransactionalInput {
  userId: string;
  to: { email: string; name?: string };
  templateKey: string;
  subject: string;
  html: string;
  text: string;
  campaignKey?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  /** Stable per logical message. Resend retains these keys for 24 hours. */
  idempotencyKey?: string;
}
export interface SendTransactionalResult { success: boolean; messageId?: string; error?: string }

/** Sends through the configured transport. Mailpit captures locally; it never falls back to Resend. */
export async function sendTransactional(input: SendTransactionalInput): Promise<SendTransactionalResult> {
  const transport = getEmailTransport();
  if (!transport) return { success: false, error: 'Email transport is not configured' };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { success: false, error: 'Supabase is not configured for transactional email' };
  }
  const supabase = createAdminClient();
  try {
    const settings = await getTenantSettings();
    const fromEmail = transport.provider === 'mailpit' ? 'openmembers@example.test' :
      settings.email_from_address ?? process.env.RESEND_SENDER_EMAIL ?? process.env.BREVO_SENDER_EMAIL ?? '';
    const fromName = settings.email_from_name ?? process.env.RESEND_SENDER_NAME ?? process.env.BREVO_SENDER_NAME ?? settings.site_name;
    const replyTo = transport.provider === 'mailpit' ? fromEmail : settings.email_reply_to ?? fromEmail;
    if (!fromEmail || /[\r\n]/.test([fromEmail, fromName, input.to.email, input.to.name ?? '', input.subject, replyTo].join(''))) {
      return { success: false, error: 'Email sender or headers are invalid' };
    }
    if (input.idempotencyKey && !/^[\x21-\x7E]{1,256}$/.test(input.idempotencyKey)) {
      return { success: false, error: 'Email idempotency key is invalid' };
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (transport.provider === 'resend') {
      headers.Authorization = `Bearer ${transport.apiKey}`;
      if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;
    }
    const payload = transport.provider === 'mailpit' ? {
      From: { Email: fromEmail, Name: fromName }, To: [{ Email: input.to.email, Name: input.to.name ?? '' }],
      ReplyTo: [{ Email: replyTo }], Subject: input.subject, HTML: input.html, Text: input.text,
    } : {
      from: fromName ? `${JSON.stringify(fromName)} <${fromEmail}>` : fromEmail,
      to: [input.to.name ? `${JSON.stringify(input.to.name)} <${input.to.email}>` : input.to.email],
      reply_to: replyTo, subject: input.subject, html: input.html, text: input.text,
      tags: (input.tags ?? [input.templateKey]).map(value => ({ name: 'category', value })),
    };
    const response = await fetch(transport.provider === 'mailpit' ? transport.url : 'https://api.resend.com/emails', {
      method: 'POST', headers, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; ID?: string };
    const messageId = transport.provider === 'mailpit' ? body.ID : body.id;
    if (!response.ok || typeof messageId !== 'string' || !messageId) {
      const error = `${transport.provider} send failed (${response.status})`;
      await logSend(supabase, input, transport.provider, { status: 'failed', errorMessage: error });
      return { success: false, error };
    }
    await logSend(supabase, input, transport.provider, { status: 'sent', providerMessageId: messageId });
    return { success: true, messageId };
  } catch {
    const error = 'Email transport or configuration failed';
    await logSend(supabase, input, transport.provider, { status: 'failed', errorMessage: error });
    return { success: false, error };
  }
}

async function logSend(supabase: ReturnType<typeof createAdminClient>, input: SendTransactionalInput, provider: string,
  result: { status: 'sent' | 'failed'; providerMessageId?: string; errorMessage?: string }) {
  try {
    const { error } = await supabase.from('email_sends').insert({
      user_id: input.userId, template_key: input.templateKey, campaign_key: input.campaignKey ?? null,
      status: result.status, provider_message_id: result.providerMessageId ?? null,
      error_message: result.errorMessage ?? null, metadata: { ...input.metadata, transport: provider },
    });
    if (error) console.error('[email] Failed to record delivery audit');
  } catch { console.error('[email] Failed to record delivery audit'); }
}

/** Fail closed: an unavailable cooldown query must not cause duplicate campaign sends. */
export async function wasRecentlySent(
  userId: string,
  campaignKey: string,
  cooldownDays: number,
  now: Date = new Date(),
): Promise<boolean> {
  const { data, error } = await createAdminClient().from('email_sends').select('id')
    .eq('user_id', userId).eq('campaign_key', campaignKey).eq('status', 'sent')
    .gte('sent_at', new Date(now.getTime() - cooldownDays * 86_400_000).toISOString()).limit(1).maybeSingle();
  if (error) throw new Error('Email cooldown query failed');
  return Boolean(data);
}
