import { loadJobRows } from '@/lib/jobs/drip';
import { getEmailTransport } from '@/lib/services/email/config';
import { parseAuthOrigin } from '@/core/security/auth-redirect';
import { normalizePublicUrl } from '@/core/security/public-url';
import { authorizeJob } from '@/lib/jobs/auth';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/core/supabase/admin';
import { sendTransactional, wasRecentlySent } from '@/lib/services/email/resend';
import {
  loadTemplateOverride,
  resolveTemplateContent,
  renderExpirationWarning,
  TEMPLATE_KEYS,
  type ExpirationWarningContent,
} from '@/lib/services/email/templates';
import { getTenantSettings } from '@/core/theme/settings';
import { getEmailBranding } from '@/lib/services/email/branding';
import { resolveRecipientLocale } from '@/core/i18n/recipient-locale.server';

/**
 * Daily cron — warns students whose enrollment lapses in the next week.
 *
 * Window is [now+6d, now+7d]: a one-day slice ensures each enrollment
 * crosses the window exactly once as it approaches expiration. Cooldown
 * of 8 days via wasRecentlySent() catches the (rare) case where an admin
 * bumps expires_at backward and re-enters the window.
 *
 * If a user holds multiple enrollments that expire inside the same 7-day
 * window, they get one warning email on the first one processed; the
 * cooldown swallows the rest. Acceptable for MVP — typical students
 * have a single active enrollment.
 */
export async function GET(request: NextRequest) {
  const denied = authorizeJob(request);
  if (denied) return denied;
  if (!getEmailTransport()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  try {
    const admin = createAdminClient();
    const settings = await getTenantSettings();
    const siteUrl = parseAuthOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? '');
    const emailBranding = getEmailBranding(settings, siteUrl);

    const now = new Date();
    const windowStart = new Date(now.getTime() + 6 * 86_400_000).toISOString();
    const windowEnd = new Date(now.getTime() + 7 * 86_400_000).toISOString();

    const enrollments = await loadJobRows<{ id: string; user_id: string; access_level_id: string; expires_at: string }>((start, end) => admin
      .from('enrollments')
      .select('id, user_id, access_level_id, expires_at')
      .eq('is_active', true)
      .gte('expires_at', windowStart)
      .lt('expires_at', windowEnd)
      .order('id').range(start, end));

    if (!enrollments?.length) {
      return NextResponse.json({ sent: 0, ranAt: now.toISOString() });
    }

    // A global authored row is loaded once; locale-specific defaults are
    // resolved per recipient below.
    const override = await loadTemplateOverride<ExpirationWarningContent>(
      TEMPLATE_KEYS.EXPIRATION_WARNING_7D,
    );

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const enrollment of enrollments) {
      try {
        // Cooldown check — skip if we already warned this user recently.
        const alreadySent = await wasRecentlySent(
          enrollment.user_id,
          TEMPLATE_KEYS.EXPIRATION_WARNING_7D,
          8,
          now,
        );
        if (alreadySent) {
          skipped++;
          continue;
        }

        // Resolve email + display name
        const { data: authUser, error: authError } = await admin.auth.admin.getUserById(enrollment.user_id);
        const email = authUser?.user?.email;
        if (authError || !email) {
          failed++;
          continue;
        }

        const { data: profile, error: profileError } = await admin
          .from('profiles')
          .select('display_name,status')
          .eq('id', enrollment.user_id)
          .maybeSingle();

        if (profileError || !profile) { failed++; continue; }
        if (profile.status !== 'active') { skipped++; continue; }
        const { locale, source: localeSource } = await resolveRecipientLocale(enrollment.user_id);

        // Pick one course from the access level to name in the email + link to
        const { data: alc, error: courseError } = await admin
          .from('access_level_courses')
          .select('course:courses(title, slug, checkout_url)')
          .eq('access_level_id', enrollment.access_level_id)
          .limit(1)
          .maybeSingle();

        if (courseError) { failed++; continue; }
        const course =
          (alc?.course as { title: string; slug: string; checkout_url: string | null } | undefined) ??
          null;
        const checkoutUrl = normalizePublicUrl(course?.checkout_url);
        const renewUrl = checkoutUrl
          ? new URL(checkoutUrl, siteUrl).href
          : course?.slug
            ? `${siteUrl}/courses/${course.slug}`
            : `${siteUrl}/dashboard`;

        const content = resolveTemplateContent(
          TEMPLATE_KEYS.EXPIRATION_WARNING_7D,
          locale,
          override,
        );
        const { subject, html, text } = await renderExpirationWarning(
          {
            studentName: profile?.display_name ?? null,
            courseTitle: course?.title ?? null,
            expiresAt: enrollment.expires_at,
            renewUrl,
            locale,
            now,
            ...emailBranding,
          },
          content,
        );

        const result = await sendTransactional({
          userId: enrollment.user_id,
          to: { email, name: profile?.display_name ?? undefined },
          templateKey: TEMPLATE_KEYS.EXPIRATION_WARNING_7D,
          campaignKey: TEMPLATE_KEYS.EXPIRATION_WARNING_7D,
          idempotencyKey: `expiration/${enrollment.id}/${enrollment.expires_at}`,
          subject,
          html,
          text,
          metadata: {
            enrollmentId: enrollment.id,
            accessLevelId: enrollment.access_level_id,
            expiresAt: enrollment.expires_at,
            locale,
            localeSource,
          },
        });

        if (result.success) sent++;
        else failed++;
      } catch (err) {
        console.error(`[expiration-warning] enrollment ${enrollment.id} failed:`, err);
        failed++;
      }
    }

    console.log(
      `[expiration-warning] sent=${sent} skipped=${skipped} failed=${failed} total=${enrollments.length}`,
    );

    return NextResponse.json({
      sent,
      skipped,
      failed,
      total: enrollments.length,
      ranAt: now.toISOString(),
    }, { status: failed > 0 ? 503 : 200 });
  } catch (err) {
    console.error('[expiration-warning] fatal:', err);
    return NextResponse.json({ error: 'job_failed' }, { status: 500 });
  }
}
