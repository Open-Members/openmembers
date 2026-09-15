import { createAdminClient } from '@/core/supabase/admin';
import { getTenantSettings } from '@/core/theme/settings';
import { getInstallationConfig } from '@/core/config/installation.server';
import { getEmailBranding, resolveMembershipEmailLinks } from '@/lib/services/email/branding';
import { sendTransactional } from '@/lib/services/email/resend';
import {
  renderWelcomeWithPassword,
  renderPurchaseConfirmed,
  renderMembershipWelcome,
  loadLocalizedTemplateContent,
  TEMPLATE_KEYS,
} from '@/lib/services/email/templates';
import { notifyEnrollment } from '@/features/Enrollment/notifications';
import { generateTempPassword } from '@/shared/lib/generate-password';
import { resolveRecipientLocale } from '@/core/i18n/recipient-locale.server';

interface EnrollmentRequest {
  email: string;
  name?: string;
  provider: 'stripe' | 'hotmart' | 'guru' | 'generic';
  transactionId: string;
  webhookConfigId?: string;
  // Fallback access level — used when no product mapping matches.
  accessLevelId: string | null;
  expirationDays?: number | null;
  expiresAt?: string | null;
  // Optional — the external product id from the provider's payload
  // (Stripe price id, Hotmart product id, Guru product id, etc.). When
  // present we look up webhook_product_mappings first; otherwise we fall
  // back to the webhook_config's access_level_id.
  externalProductId?: string | null;
}

interface EnrollmentResult {
  userId: string;
  enrollmentId: string;
  isNewUser: boolean;
  accessLevelId: string;
  duplicate?: boolean;
}

export async function processEnrollment(
  request: EnrollmentRequest,
): Promise<EnrollmentResult> {
  const supabase = createAdminClient();

  // Resolve access level: product mapping wins, config fallback is a
  // last resort and logs a warning so operators notice unmapped products.
  let resolvedAccessLevelId: string | null = null;
  let resolvedExpirationDays: number | null =
    request.expirationDays ?? null;
  let resolvedMappingId: string | null = null;

  if (request.externalProductId && request.webhookConfigId) {
    const { data: mapping, error: mappingError } = await supabase
      .from('webhook_product_mappings')
      .select('id, access_level_id, expiration_days')
      .eq('webhook_config_id', request.webhookConfigId)
      .eq('external_product_id', request.externalProductId)
      .eq('is_active', true)
      .maybeSingle();
    if (mappingError) throw new Error("Product mapping lookup failed");
    if (mapping) {
      resolvedMappingId = mapping.id as string;
      resolvedAccessLevelId = mapping.access_level_id as string;
      if (mapping.expiration_days !== null) {
        resolvedExpirationDays = mapping.expiration_days as number;
      }
    }
  }

  if (!resolvedAccessLevelId) {
    resolvedAccessLevelId = request.accessLevelId;
    if (resolvedAccessLevelId && request.externalProductId) {
      console.warn(
        `[processEnrollment] No product mapping for ${request.provider}/` +
          `${request.externalProductId} on config ${request.webhookConfigId} ` +
          `— falling back to config.access_level_id. Add a mapping to ` +
          `silence this warning.`,
      );
    }
  }

  if (!resolvedAccessLevelId) {
    // Fail-closed: reject the sale loudly instead of silently granting the
    // wrong access tier. The admin sees this in webhook_logs.error_message
    // and can add the missing offer in /admin/integrations.
    const productHint = request.externalProductId
      ? `"${request.externalProductId}"`
      : '(no product_id in payload)';
    throw new Error(
      `Unmapped product ${productHint} for ${request.provider}. ` +
        `Add an offer in /admin/integrations mapping this product ID ` +
        `to the access level that buyers should receive.`,
    );
  }

  // 1. Find or create user by email.
  //
  // Was: supabase.auth.admin.listUsers() — capped at 50 results per
  // page, which silently created DUPLICATE auth users once the platform
  // crossed that threshold (a returning customer whose row fell past
  // page 1 would be matched as "new", locking the legit customer out
  // of their own account). Now uses get_user_id_by_email() — indexed
  // single-row lookup; see 20260427_get_user_id_by_email.sql.
  const { data: existingUserId, error: lookupError } = await supabase.rpc(
    'get_user_id_by_email',
    { p_email: request.email },
  );
  if (lookupError) {
    throw new Error(`Failed to find user: ${lookupError.message}`);
  }

  let userId: string;
  let isNewUser = false;
  let tempPassword: string | null = null;

  if (existingUserId) {
    userId = existingUserId as string;
  } else {
    tempPassword = generateTempPassword();
    const { data: newUser, error: createError } =
      await supabase.auth.admin.createUser({
        email: request.email,
        password: tempPassword,
        email_confirm: true,
      });

    if (createError || !newUser.user) {
      throw new Error(
        `Failed to create user: ${createError?.message ?? 'Unknown error'}`,
      );
    }

    userId = newUser.user.id;
    isNewUser = true;
  }

  // Auth creates the profile with the canonical user/active defaults. A
  // purchase must not change an existing member's identity, role, suspension,
  // or password-rotation flag. Only initialize the account created above.
  if (isNewUser) {
    const profileUpdate: Record<string, unknown> = { must_change_password: true };
    if (request.name) profileUpdate.display_name = request.name;
    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', userId)
      .select('id')
      .single();
    if (profileError) {
      throw new Error(`Failed to initialize profile: ${profileError.message}`);
    }
  }

  // 2. Calculate expiration
  let expiresAt: string | null = request.expiresAt ?? null;
  if (request.expiresAt === undefined && resolvedExpirationDays !== null && resolvedExpirationDays > 0) {
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + resolvedExpirationDays);
    expiresAt = expDate.toISOString();
  }

  // Receipt + enrollment + cohort assignment commit in one database transaction.
  // A replay after a process crash cannot renew access or dispatch notices again.
  const { data: applied, error: enrollError } = await supabase.rpc('apply_payment_enrollment', {
    p_provider: request.provider,
    p_transaction_id: request.transactionId,
    p_user_id: userId,
    p_access_level_id: resolvedAccessLevelId,
    p_product_id: request.externalProductId ?? null,
    p_expires_at: expiresAt,
    p_mapping_id: resolvedMappingId,
  });
  if (enrollError || !applied?.enrollment_id) {
    throw new Error(`Failed to create enrollment: ${enrollError?.message ?? 'Missing receipt'}`);
  }
  const enrollment = { id: applied.enrollment_id as string };
  if (applied.duplicate) {
    return { userId, enrollmentId: enrollment.id, isNewUser, accessLevelId: resolvedAccessLevelId, duplicate: true };
  }

  // 4. Send email — fail-soft so a bad SMTP doesn't break enrollment creation.
  try {
    const delivery = await sendEnrollmentEmail({
      userId,
      email: request.email,
      name: request.name ?? null,
      accessLevelId: resolvedAccessLevelId,
      isNewUser,
      tempPassword,
    });
    if (!delivery.success) {
      console.error('[enrollment] Email delivery failed');
    }
  } catch {
    console.error('[enrollment] Email delivery failed');
  }

  // 5. In-app welcome notification. Fail-soft — handled inside the helper.
  await notifyEnrollment({ userId, accessLevelId: resolvedAccessLevelId }).catch(() => {
    console.error("[enrollment] In-app notification failed");
  });

  return {
    userId,
    enrollmentId: enrollment.id,
    isNewUser,
    accessLevelId: resolvedAccessLevelId,
  };
}

export async function sendEnrollmentEmail(params: {
  userId: string;
  email: string;
  name: string | null;
  accessLevelId: string;
  isNewUser: boolean;
  tempPassword: string | null;
}) {
  const supabase = createAdminClient();
  const settings = await getTenantSettings();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const emailBranding = getEmailBranding(settings, siteUrl);
  const { locale, source: localeSource } = await resolveRecipientLocale(params.userId);
  const now = new Date();

  // Resolve what to call the thing the buyer just unlocked. Single-course
  // access levels (a one-off course sale) keep "Welcome to <course>"; for
  // multi-course memberships we use the access level name instead — picking
  // any one course title would look arbitrary to the buyer ("you have access
  // to <random module>" instead of "you have access to <Membership>").
  const [levelResult, coursesResult] = await Promise.all([
    supabase
      .from('access_levels')
      .select('name')
      .eq('id', params.accessLevelId)
      .maybeSingle(),
    supabase
      .from('access_level_courses')
      .select('course:courses(title, slug)')
      .eq('access_level_id', params.accessLevelId),
  ]);
  if (levelResult.error || coursesResult.error || !levelResult.data) {
    throw new Error('enrollmentEmailContextUnavailable');
  }
  const level = levelResult.data;
  const courseRows = coursesResult.data;

  const courses = (courseRows ?? [])
    .map((r) => r.course as unknown as { title: string; slug: string } | null)
    .filter((c): c is { title: string; slug: string } => c !== null);
  const isMembership = courses.length > 1;
  const course = courses[0] ?? null;
  const productTitle = isMembership
    ? level?.name ?? null
    : course?.title ?? null;
  const courseUrl =
    !isMembership && course
      ? `${siteUrl}/courses/${course.slug}`
      : `${siteUrl}/dashboard`;

  // Membership purchases get the dedicated onboarding email with configured
  // optional community/help destinations. New buyers see
  // their temporary password inline; existing buyers just get the login CTA.
  // Single-course sales keep the simpler welcome / purchase-confirmed emails.
  if (isMembership) {
    const membershipLinks = resolveMembershipEmailLinks((await getInstallationConfig()).links, siteUrl);
    const content = await loadLocalizedTemplateContent(TEMPLATE_KEYS.MEMBERSHIP_WELCOME, locale);
    const { subject, html, text } = await renderMembershipWelcome(
      {
        studentName: params.name,
        studentEmail: params.email,
        temporaryPassword:
          params.isNewUser && params.tempPassword ? params.tempPassword : null,
        loginUrl: `${siteUrl}/login`,
        locale,
        now,
        ...membershipLinks,
        ...emailBranding,
      },
      content,
    );

    return sendTransactional({
      userId: params.userId,
      to: { email: params.email, name: params.name ?? undefined },
      templateKey: TEMPLATE_KEYS.MEMBERSHIP_WELCOME,
      subject,
      html,
      text,
      metadata: {
        accessLevelId: params.accessLevelId,
        isNewUser: params.isNewUser,
        locale,
        localeSource,
      },
    });
  } else if (params.isNewUser && params.tempPassword) {
    const content = await loadLocalizedTemplateContent(TEMPLATE_KEYS.WELCOME_WITH_PASSWORD, locale);
    const { subject, html, text } = await renderWelcomeWithPassword(
      {
        studentName: params.name,
        studentEmail: params.email,
        temporaryPassword: params.tempPassword,
        loginUrl: `${siteUrl}/login`,
        courseTitle: productTitle,
        locale,
        now,
        ...emailBranding,
      },
      content,
    );

    return sendTransactional({
      userId: params.userId,
      to: { email: params.email, name: params.name ?? undefined },
      templateKey: TEMPLATE_KEYS.WELCOME_WITH_PASSWORD,
      subject,
      html,
      text,
      metadata: {
        accessLevelId: params.accessLevelId,
        courseSlug: isMembership ? null : course?.slug ?? null,
        locale,
        localeSource,
      },
    });
  } else {
    const content = await loadLocalizedTemplateContent(TEMPLATE_KEYS.PURCHASE_CONFIRMED, locale);
    const { subject, html, text } = await renderPurchaseConfirmed(
      {
        studentName: params.name,
        courseTitle: productTitle,
        courseUrl,
        locale,
        now,
        ...emailBranding,
      },
      content,
    );

    return sendTransactional({
      userId: params.userId,
      to: { email: params.email, name: params.name ?? undefined },
      templateKey: TEMPLATE_KEYS.PURCHASE_CONFIRMED,
      subject,
      html,
      text,
      metadata: {
        accessLevelId: params.accessLevelId,
        courseSlug: isMembership ? null : course?.slug ?? null,
        locale,
        localeSource,
      },
    });
  }
}

export async function logWebhook(data: {
  webhookConfigId?: string;
  provider: string;
  eventType?: string;
  payload: Record<string, unknown>;
  status: 'received' | 'processed' | 'failed';
  errorMessage?: string;
}) {
  const supabase = createAdminClient();

  await supabase.from('webhook_logs').insert({
    webhook_config_id: data.webhookConfigId ?? null,
    provider: data.provider,
    event_type: data.eventType ?? null,
    payload: data.payload,
    status: data.status,
    error_message: data.errorMessage ?? null,
    processed_at: new Date().toISOString(),
  });
}
