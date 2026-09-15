import { randomBytes } from 'crypto';
import { createAdminClient } from '@/core/supabase/admin';
import { defaultLocale, type Locale } from '@/core/i18n/config';
import {
  buildCertificateFileName,
  getCertificatePdfCopy,
  resolveCertificateLocale,
} from '@/core/certificates/localization';
import {
  generateCertificate,
  type CertificateTemplate,
  type CertificateData,
} from '@/core/pdf/certificate';

export type CertificateCheck =
  | { eligible: true; courseTitle: string; completionDate: string }
  | {
      eligible: false;
      reason: 'course_not_found' | 'cert_disabled' | 'not_complete';
    };

export type CertificateBuildError =
  | 'course_not_found'
  | 'cert_disabled'
  | 'not_complete'
  | 'certificate_unavailable'
  | 'certificate_generation_failed';

export type CertificateBuildOptions = {
  localeHint?: unknown;
  now?: Date;
};

type TenantCertificateRow = {
  primary_color?: string | null;
  logo_light_url?: string | null;
  logo_dark_url?: string | null;
  logo_url?: string | null;
  certificate_title?: string | null;
  certificate_body?: string | null;
  certificate_signature_url?: string | null;
  certificate_signature_name?: string | null;
  certificate_signature_role?: string | null;
  certificate_footer?: string | null;
  certificate_accent_color?: string | null;
  certificate_logo_url?: string | null;
};

/** Check completion and both certificate switches without hiding read errors. */
export async function checkCertificateEligibility(
  userId: string,
  courseId: string,
  now: Date = new Date(),
): Promise<CertificateCheck> {
  const supabase = createAdminClient();
  const [courseResult, tenantResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, certificate_enabled, is_published')
      .eq('id', courseId)
      .maybeSingle(),
    supabase
      .from('tenant_settings')
      .select('certificate_enabled')
      .limit(1)
      .maybeSingle(),
  ]);

  if (courseResult.error || tenantResult.error) {
    throw new Error('certificateEligibilityReadFailed');
  }
  const course = courseResult.data;
  const tenant = tenantResult.data;
  if (!course) return { eligible: false, reason: 'course_not_found' };
  if (!course.certificate_enabled || !tenant?.certificate_enabled) {
    return { eligible: false, reason: 'cert_disabled' };
  }

  const modulesResult = await supabase
    .from('modules')
    .select('id')
    .eq('course_id', courseId)
    .eq('is_published', true);
  if (modulesResult.error) throw new Error('certificateModulesReadFailed');
  const moduleIds = (modulesResult.data ?? []).map((module) => module.id);
  if (moduleIds.length === 0) {
    return { eligible: false, reason: 'not_complete' };
  }

  const lessonsResult = await supabase
    .from('lessons')
    .select('id')
    .in('module_id', moduleIds)
    .eq('is_published', true);
  if (lessonsResult.error) throw new Error('certificateLessonsReadFailed');
  const lessonIds = (lessonsResult.data ?? []).map((lesson) => lesson.id);
  if (lessonIds.length === 0) {
    return { eligible: false, reason: 'not_complete' };
  }

  const progressResult = await supabase
    .from('lesson_progress')
    .select('lesson_id, completed_at')
    .eq('user_id', userId)
    .eq('is_completed', true)
    .in('lesson_id', lessonIds);
  if (progressResult.error) throw new Error('certificateProgressReadFailed');

  const completed = progressResult.data ?? [];
  if (completed.length < lessonIds.length) {
    return { eligible: false, reason: 'not_complete' };
  }

  const dates = completed
    .map((row) => row.completed_at)
    .filter((date): date is string => !!date)
    .sort();
  return {
    eligible: true,
    courseTitle: course.title,
    completionDate: dates[dates.length - 1] ?? now.toISOString(),
  };
}

function mapIssuedCertificate(row: {
  id: string;
  verification_code: string;
  issued_at: string;
}) {
  return {
    id: row.id,
    verificationCode: row.verification_code,
    issuedAt: row.issued_at,
  };
}

/** Issue once per user/course and recover a concurrent unique-key winner. */
export async function issueCertificate(
  userId: string,
  courseId: string,
  completionDate: string,
): Promise<{ id: string; verificationCode: string; issuedAt: string }> {
  const supabase = createAdminClient();
  const existingResult = await supabase
    .from('certificates')
    .select('id, verification_code, issued_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (existingResult.error) throw new Error('certificateIssueReadFailed');
  if (existingResult.data) return mapIssuedCertificate(existingResult.data);

  const verificationCode = randomBytes(8).toString('hex').toUpperCase();
  const inserted = await supabase
    .from('certificates')
    .insert({
      user_id: userId,
      course_id: courseId,
      verification_code: verificationCode,
      issued_at: completionDate,
    })
    .select('id, verification_code, issued_at')
    .single();

  if (!inserted.error && inserted.data) {
    return mapIssuedCertificate(inserted.data);
  }
  if (inserted.error?.code !== '23505') {
    throw new Error('certificateIssueFailed');
  }

  const concurrentResult = await supabase
    .from('certificates')
    .select('id, verification_code, issued_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (concurrentResult.error || !concurrentResult.data) {
    throw new Error('certificateIssueConflictReadFailed');
  }
  return mapIssuedCertificate(concurrentResult.data);
}

/** Load authored template fields and fill only null values with product defaults. */
export async function loadCertificateTemplate(
  locale: Locale = defaultLocale,
): Promise<CertificateTemplate> {
  const supabase = createAdminClient();
  const result = await supabase
    .from('tenant_settings')
    .select(`
      primary_color, logo_light_url, logo_dark_url, logo_url,
      certificate_title, certificate_body,
      certificate_signature_url, certificate_signature_name, certificate_signature_role,
      certificate_footer, certificate_accent_color, certificate_logo_url
    `)
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error('certificateTemplateReadFailed');

  const row = (result.data ?? {}) as TenantCertificateRow;
  const copy = getCertificatePdfCopy(locale);
  return {
    title: row.certificate_title ?? copy.defaultTitle,
    body: row.certificate_body ?? '',
    signatureUrl: row.certificate_signature_url ?? null,
    signatureName: row.certificate_signature_name ?? null,
    signatureRole: row.certificate_signature_role ?? null,
    footer: row.certificate_footer ?? null,
    accentColor:
      row.certificate_accent_color ?? row.primary_color ?? '#0235A8',
    logoUrl: row.certificate_logo_url ?? null,
    logoFallbackUrl:
      row.certificate_logo_url == null
        ? row.logo_light_url ?? row.logo_dark_url ?? row.logo_url ?? null
        : null,
  };
}

/** Generate full PDF bytes for one recipient and course. */
export async function buildCertificatePdf(
  userId: string,
  courseId: string,
  options: CertificateBuildOptions = {},
): Promise<
  { bytes: Uint8Array; fileName: string } | { error: CertificateBuildError }
> {
  try {
    const now = options.now ?? new Date();
    const check = await checkCertificateEligibility(userId, courseId, now);
    if (!check.eligible) return { error: check.reason };

    const supabase = createAdminClient();
    const profileResult = await supabase
      .from('profiles')
      .select('display_name, preferred_locale')
      .eq('id', userId)
      .maybeSingle();
    if (profileResult.error || !profileResult.data) {
      return { error: 'certificate_unavailable' };
    }

    const locale = resolveCertificateLocale(
      profileResult.data.preferred_locale,
      options.localeHint,
    );
    const copy = getCertificatePdfCopy(locale);
    let recipientName = profileResult.data.display_name?.trim() ?? '';
    if (!recipientName) {
      const authResult = await supabase.auth.admin.getUserById(userId);
      if (authResult.error) return { error: 'certificate_unavailable' };
      recipientName =
        authResult.data.user?.email?.trim() || copy.studentFallback;
    }

    const template = await loadCertificateTemplate(locale);
    const issued = await issueCertificate(
      userId,
      courseId,
      check.completionDate,
    );
    const data: CertificateData = {
      recipientName,
      courseTitle: check.courseTitle,
      date: check.completionDate,
      verificationCode: issued.verificationCode,
    };

    try {
      const bytes = await generateCertificate(template, data, { locale, copy });
      return {
        bytes,
        fileName: buildCertificateFileName(check.courseTitle, locale),
      };
    } catch {
      return { error: 'certificate_generation_failed' };
    }
  } catch {
    return { error: 'certificate_unavailable' };
  }
}

/** Preview with localized fictitious data and no certificate-row side effect. */
export async function buildCertificatePreviewPdf(
  locale: Locale,
  overrides?: Partial<CertificateTemplate>,
  now: Date = new Date(),
): Promise<Uint8Array> {
  const template = await loadCertificateTemplate(locale);
  const merged = { ...template };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value !== undefined) {
      Object.assign(merged, { [key]: value });
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(overrides, 'logoUrl') &&
    overrides?.logoUrl !== null
  ) {
    merged.logoFallbackUrl = null;
  }

  const copy = getCertificatePdfCopy(locale);
  return generateCertificate(
    merged,
    {
      recipientName: copy.previewStudent,
      courseTitle: copy.previewCourse,
      date: now.toISOString(),
      verificationCode: 'PREVIEW12345678',
    },
    { locale, copy },
  );
}
