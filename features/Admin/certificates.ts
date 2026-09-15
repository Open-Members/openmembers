'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import {
  buildCertificatePreviewPdf,
  loadCertificateTemplate,
} from '@/core/certificates/service';
import type { CertificateTemplate } from '@/core/pdf/certificate';
import { resolveCertificateLocale } from '@/core/certificates/localization';
import { getLocale } from 'next-intl/server';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('certificateAdminUnauthenticated');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status, preferred_locale')
    .eq('id', user.id)
    .single();
  if (profileError) throw new Error('certificateAdminProfileReadFailed');
  if (
    profile?.status !== 'active' ||
    (profile?.role !== 'admin' && profile?.role !== 'super_admin')
  ) {
    throw new Error('certificateAdminForbidden');
  }
  return {
    locale: resolveCertificateLocale(profile.preferred_locale, await getLocale()),
  };
}

export type AdminCertificateSettings = {
  enabled: boolean;
  title: string | null;
  body: string | null;
  signatureUrl: string | null;
  signatureName: string | null;
  signatureRole: string | null;
  footer: string | null;
  accentColor: string | null;
  logoUrl: string | null;
};

const nullableTextFields = [
  'title',
  'body',
  'signatureName',
  'signatureRole',
  'footer',
] as const satisfies readonly (keyof AdminCertificateSettings)[];

function isSafeAssetUrl(value: unknown): value is string | null {
  if (value === null || value === '') return true;
  if (
    typeof value !== 'string' ||
    value.length > 2_048 ||
    /[\u0000-\u001f\u007f\\]/u.test(value)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password
    );
  } catch {
    return value.startsWith('/') && !value.startsWith('//');
  }
}

function isValidSettingsInput(
  value: unknown,
): value is AdminCertificateSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (typeof input.enabled !== 'boolean') return false;
  if (
    nullableTextFields.some(
      (field) => input[field] !== null && typeof input[field] !== 'string',
    )
  ) {
    return false;
  }
  if (!isSafeAssetUrl(input.signatureUrl) || !isSafeAssetUrl(input.logoUrl)) {
    return false;
  }
  return (
    input.accentColor === null ||
    input.accentColor === '' ||
    (typeof input.accentColor === 'string' &&
      /^#[0-9a-f]{6}$/iu.test(input.accentColor))
  );
}

export async function getAdminCertificateSettings(): Promise<AdminCertificateSettings> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('tenant_settings')
    .select(`
      certificate_enabled, certificate_title, certificate_body,
      certificate_signature_url, certificate_signature_name, certificate_signature_role,
      certificate_footer, certificate_accent_color, certificate_logo_url
    `)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('certificateSettingsReadFailed');

  const row = (data ?? {}) as {
    certificate_enabled?: boolean | null;
    certificate_title?: string | null;
    certificate_body?: string | null;
    certificate_signature_url?: string | null;
    certificate_signature_name?: string | null;
    certificate_signature_role?: string | null;
    certificate_footer?: string | null;
    certificate_accent_color?: string | null;
    certificate_logo_url?: string | null;
  };

  return {
    enabled: row.certificate_enabled ?? false,
    title: row.certificate_title ?? null,
    body: row.certificate_body ?? null,
    signatureUrl: row.certificate_signature_url ?? null,
    signatureName: row.certificate_signature_name ?? null,
    signatureRole: row.certificate_signature_role ?? null,
    footer: row.certificate_footer ?? null,
    accentColor: row.certificate_accent_color ?? null,
    logoUrl: row.certificate_logo_url ?? null,
  };
}

export async function saveCertificateSettings(input: AdminCertificateSettings) {
  await requireAdmin();
  if (!isValidSettingsInput(input)) return { error: 'invalid_settings' };
  const supabase = createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from('tenant_settings')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (existingError) return { error: 'settings_read_failed' };

  const payload = {
    certificate_enabled: input.enabled,
    certificate_title: input.title ?? null,
    certificate_body: input.body ?? null,
    certificate_signature_url: input.signatureUrl ?? null,
    certificate_signature_name: input.signatureName ?? null,
    certificate_signature_role: input.signatureRole ?? null,
    certificate_footer: input.footer ?? null,
    certificate_accent_color: input.accentColor ?? null,
    certificate_logo_url: input.logoUrl ?? null,
  };

  if (existing) {
    const { data: updated, error } = await supabase
      .from('tenant_settings')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .maybeSingle();
    if (error || updated?.id !== existing.id) return { error: 'save_failed' };
  } else {
    const { error } = await supabase.from('tenant_settings').insert(payload);
    if (error) return { error: 'save_failed' };
  }

  try {
    revalidatePath('/admin/certificates');
  } catch {
    // The settings are already persisted; a refresh will pick them up.
  }
  return { success: true };
}

/**
 * Preview action — returns a Base64 string of the PDF bytes so the client
 * can show it inline in an iframe without routing through an API route.
 */
export async function renderCertificatePreview(
  overrides?: Partial<CertificateTemplate>,
): Promise<{ dataUrl: string } | { error: string }> {
  try {
    const { locale } = await requireAdmin();
    const bytes = await buildCertificatePreviewPdf(locale, overrides);
    // `Buffer.from(bytes).toString('base64')` works in Node server actions.
    const base64 = Buffer.from(bytes).toString('base64');
    return { dataUrl: `data:application/pdf;base64,${base64}` };
  } catch {
    return { error: 'preview_failed' };
  }
}

// Re-export for UI type convenience
export type { CertificateTemplate } from '@/core/pdf/certificate';
export { loadCertificateTemplate };
