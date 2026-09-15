import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getEmailTransport } from '@/lib/services/email/config';
import { verifyEmailSignature } from '@/lib/services/email/signature';
import { readLimitedRequestBody, RequestBodyTooLargeError } from '@/lib/http/request-body';
import { parseAuthOrigin } from '@/core/security/auth-redirect';
import { renderReauthentication } from '@/lib/services/email/templates/reauthentication';
import { sendTransactional } from '@/lib/services/email/resend';
import { getTenantSettings } from '@/core/theme/settings';
import { getEmailBranding } from '@/lib/services/email/branding';
import { resolveRecipientLocale } from '@/core/i18n/recipient-locale.server';
import {
  TEMPLATE_KEYS,
  loadLocalizedTemplateContent,
  renderPasswordRecovery,
  renderMagicLinkLogin,
  renderEmailConfirmation,
  renderAdminInvite,
  renderEmailChange,
} from '@/lib/services/email/templates';

/**
 * Supabase Auth "Send Email" hook.
 *
 * Replaces Supabase's built-in SMTP (and its 4/hour rate limit) for every
 * auth-triggered email — recovery, magic link, signup confirmation,
 * invite, and email change. Renders our branded React Email templates
 * and dispatches via Resend (same path as the migration welcome).
 *
 * Wire-up on the Supabase side:
 *   Dashboard → Authentication → Hooks → Send Email Hook → HTTPS
 *   URL: <NEXT_PUBLIC_SITE_URL>/api/auth/send-email
 *   Secret: generate one, paste into SEND_EMAIL_HOOK_SECRET on the server
 *
 * The email template the user receives points at /api/auth/callback?
 * token_hash=…&type=…&next=… — that callback uses verifyOtp under the
 * hood, which works cross-device (no PKCE cookie needed).
 */
export const runtime = 'nodejs';

const payloadSchema = z.object({
  user: z.object({
    id: z.uuid(), email: z.email(), new_email: z.union([z.email(), z.literal('')]).optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  email_data: z.object({
    email_action_type: z.enum(['recovery', 'signup', 'invite', 'magiclink', 'email_change', 'reauthentication']),
    token: z.string().max(200).optional(), token_hash: z.string().max(500).optional(),
    token_new: z.string().max(200).optional(), token_hash_new: z.string().max(500).optional(),
  }),
}).superRefine(({ user, email_data: email }, ctx) => {
  if (email.email_action_type === 'reauthentication') {
    if (!/^\d{6,10}$/.test(email.token ?? '')) ctx.addIssue({ code: 'custom', message: 'Invalid OTP' });
  } else if (!email.token_hash) ctx.addIssue({ code: 'custom', message: 'Missing token hash' });
  if (email.email_action_type === 'email_change' && !user.new_email) ctx.addIssue({ code: 'custom', message: 'Missing new email' });
});
type AuthHookPayload = z.infer<typeof payloadSchema>;

function callbackUrl(
  siteUrl: string,
  tokenHash: string,
  type: string,
  next: string,
): string {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type,
    next,
  });
  return `${siteUrl.replace(/\/$/, '')}/api/auth/callback?${params.toString()}`;
}

function studentNameFrom(user: AuthHookPayload['user']): string | null {
  const meta = user.user_metadata ?? {};
  const candidate = meta.display_name ?? meta.full_name ?? meta.name;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  let siteUrl: string;
  try { siteUrl = parseAuthOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? ''); }
  catch { return NextResponse.json({ error: 'not_configured' }, { status: 503 }); }
  const transport = getEmailTransport();
  if (
    !secret || !transport ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  if (!['webhook-id', 'webhook-timestamp', 'webhook-signature'].every(header => request.headers.get(header))) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }
  let rawBody: Uint8Array;
  try { rawBody = await readLimitedRequestBody(request); }
  catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestBodyTooLargeError ? 'payload_too_large' : 'invalid_body' },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }
  if (!verifyEmailSignature(rawBody, request.headers, secret, 'webhook')) {
    console.warn('[send-email] signature verification failed');
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: AuthHookPayload;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(new TextDecoder().decode(rawBody)));
    if (!parsed.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    payload = parsed.data;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { user, email_data } = payload;
  try {
    const branding = await getTenantSettings();
    const emailBranding = getEmailBranding(branding, siteUrl);
    if (transport.provider !== 'mailpit' && !branding.email_from_address && !process.env.RESEND_SENDER_EMAIL && !process.env.BREVO_SENDER_EMAIL) {
      return NextResponse.json({ error: 'not_configured' }, { status: 503 });
    }
    const studentName = studentNameFrom(user);
    let localeResolution: Awaited<ReturnType<typeof resolveRecipientLocale>>;
    try {
      localeResolution = await resolveRecipientLocale(user.id, user.user_metadata?.delivery_locale);
    } catch {
      return NextResponse.json({ error: 'locale_unavailable' }, { status: 503 });
    }
    const { locale, source: localeSource } = localeResolution;
    const now = new Date();

    let subject: string;
    let html: string;
    let text: string;
    let templateKey: string;
    const toEmail = user.email;
    const messageKey = (recipient: string) => `auth/${createHash('sha256').update(`${request.headers.get('webhook-id')}/${recipient}`).digest('hex')}`;

    switch (email_data.email_action_type) {
      case 'recovery': {
        const content = await loadLocalizedTemplateContent(TEMPLATE_KEYS.PASSWORD_RECOVERY, locale);
        const rendered = await renderPasswordRecovery(
          {
            studentName,
            studentEmail: user.email,
            recoveryUrl: callbackUrl(siteUrl, email_data.token_hash!, 'recovery', '/reset-password'),
            locale,
            now,
            ...emailBranding,
          },
          content,
        );
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;
        templateKey = TEMPLATE_KEYS.PASSWORD_RECOVERY;
        break;
      }
      case 'magiclink': {
        const content = await loadLocalizedTemplateContent(TEMPLATE_KEYS.MAGIC_LINK_LOGIN, locale);
        const rendered = await renderMagicLinkLogin(
          {
            studentName,
            studentEmail: user.email,
            loginUrl: callbackUrl(siteUrl, email_data.token_hash!, 'magiclink', '/dashboard'),
            locale,
            now,
            ...emailBranding,
          },
          content,
        );
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;
        templateKey = TEMPLATE_KEYS.MAGIC_LINK_LOGIN;
        break;
      }
      case 'signup': {
        const content = await loadLocalizedTemplateContent(TEMPLATE_KEYS.EMAIL_CONFIRMATION, locale);
        const rendered = await renderEmailConfirmation(
          {
            studentName,
            studentEmail: user.email,
            confirmUrl: callbackUrl(siteUrl, email_data.token_hash!, 'signup', '/dashboard'),
            locale,
            now,
            ...emailBranding,
          },
          content,
        );
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;
        templateKey = TEMPLATE_KEYS.EMAIL_CONFIRMATION;
        break;
      }
      case 'invite': {
        const content = await loadLocalizedTemplateContent(TEMPLATE_KEYS.ADMIN_INVITE, locale);
        const rendered = await renderAdminInvite(
          {
            studentName,
            studentEmail: user.email,
            acceptUrl: callbackUrl(siteUrl, email_data.token_hash!, 'invite', '/reset-password'),
            locale,
            now,
            ...emailBranding,
          },
          content,
        );
        subject = rendered.subject;
        html = rendered.html;
        text = rendered.text;
        templateKey = TEMPLATE_KEYS.ADMIN_INVITE;
        break;
      }
      case 'email_change': {
        // Supabase's field names are reversed for compatibility: _new belongs to the current address.
        const recipients = [
          ...(email_data.token_hash_new ? [{ email: user.email, hash: email_data.token_hash_new }] : []),
          { email: user.new_email!, hash: email_data.token_hash! },
        ];
        const content = await loadLocalizedTemplateContent(TEMPLATE_KEYS.EMAIL_CHANGE, locale);
        for (const recipient of recipients) {
          const rendered = await renderEmailChange({ studentName, newEmail: user.new_email!,
            confirmUrl: callbackUrl(siteUrl, recipient.hash, 'email_change', '/profile'), locale, now, ...emailBranding }, content);
          const result = await sendTransactional({ userId: user.id, to: { email: recipient.email, name: studentName ?? undefined },
            templateKey: TEMPLATE_KEYS.EMAIL_CHANGE, ...rendered, idempotencyKey: messageKey(recipient.email),
            metadata: { action: 'email_change', locale, localeSource } });
          if (!result.success) return NextResponse.json({ error: 'send_failed' }, { status: 502 });
        }
        return NextResponse.json({ success: true });
      }
      case 'reauthentication': {
        const content = await loadLocalizedTemplateContent(TEMPLATE_KEYS.REAUTHENTICATION, locale);
        ({ subject, html, text } = await renderReauthentication({ token: email_data.token!, locale, now, ...emailBranding }, content));
        templateKey = TEMPLATE_KEYS.REAUTHENTICATION;
        break;
      }
      default: {
        console.warn('[send-email] unknown action type:', email_data.email_action_type);
        return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
      }
    }

    const result = await sendTransactional({
      userId: user.id,
      to: { email: toEmail, name: studentName ?? undefined },
      templateKey,
      subject,
      html,
      text,
      idempotencyKey: messageKey(toEmail),
      metadata: { action: email_data.email_action_type, locale, localeSource },
    });

    if (!result.success) {
      return NextResponse.json({ error: 'send_failed' }, { status: 502 });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch {
    console.error('[send-email] template or transport failed');
    return NextResponse.json({ error: 'send_failed' }, { status: 500 });
  }
}
