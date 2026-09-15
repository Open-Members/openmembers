import 'server-only';
import { sendTransactional } from '@/lib/services/email/resend';
import { getEmailTransport } from '@/lib/services/email/config';
import { getTenantSettings } from '@/core/theme/settings';
import { createAdminClient } from '@/core/supabase/admin';
import { defaultLocale } from '@/core/i18n/config';
import { resolveRecipientLocale } from '@/core/i18n/recipient-locale.server';
import { loadLocalizedTemplateContent, TEMPLATE_KEYS, substituteVars } from '@/lib/services/email/templates';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function resolveSupportInboxLocale(inbox: string) {
  const admin = createAdminClient();
  const { data: inboxUserId, error: lookupError } = await admin.rpc(
    'get_user_id_by_email',
    { p_email: inbox },
  );
  if (lookupError) throw new Error('supportLocaleReadFailed');
  if (typeof inboxUserId !== 'string' || !inboxUserId) {
    return { locale: defaultLocale, source: 'default' as const };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role,status')
    .eq('id', inboxUserId)
    .maybeSingle();
  if (profileError) throw new Error('supportLocaleReadFailed');
  if (!profile || profile.status !== 'active' || !['admin', 'super_admin'].includes(profile.role)) {
    return { locale: defaultLocale, source: 'default' as const };
  }
  return resolveRecipientLocale(inboxUserId);
}

// Notification failure never blocks creation of the support ticket.
export async function notifyAdminOfNewTicket(params: {
  ticketId: string;
  userId: string;
  subject: string;
  message: string;
  userDisplayName: string | null;
}): Promise<void> {
  try {
    if (!getEmailTransport()) return;
    const settings = await getTenantSettings();
    const inbox = settings.support_inbox_email ?? process.env.SUPPORT_INBOX_EMAIL;
    if (!inbox) return;
    const { locale, source: localeSource } = await resolveSupportInboxLocale(inbox);
    const copy = await loadLocalizedTemplateContent(TEMPLATE_KEYS.SUPPORT_NEW_TICKET, locale);
    const who = params.userDisplayName ?? copy.unknownUser;
    const subject = `${copy.subjectPrefix} ${params.subject}`;
    const html =
      `<h2>${escapeHtml(copy.heading)}</h2>` +
      `<p><strong>${escapeHtml(copy.fromLabel)}:</strong> ${escapeHtml(who)}</p>` +
      `<p><strong>${escapeHtml(copy.subjectLabel)}:</strong> ${escapeHtml(params.subject)}</p>` +
      `<hr/>` +
      `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(params.message)}</pre>` +
      `<p style="color:#666;font-size:12px">${escapeHtml(copy.ticketIdLabel)}: ${escapeHtml(params.ticketId)}</p>`;
    const text = `${substituteVars(copy.openedText, { userName: who })}\n\n${copy.subjectLabel}: ${params.subject}\n\n${params.message}\n\n${copy.ticketIdLabel}: ${params.ticketId}`;

    const result = await sendTransactional({
      userId: params.userId, to: { email: inbox }, templateKey: TEMPLATE_KEYS.SUPPORT_NEW_TICKET,
      subject, html, text, idempotencyKey: `support/${params.ticketId}`,
      metadata: { ticketId: params.ticketId, locale, localeSource },
    });
    if (!result.success) console.warn('[support.notify] notification failed; ticket remains available');
  } catch { console.warn('[support.notify] notification failed; ticket remains available'); }
}
