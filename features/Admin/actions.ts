'use server';

import { getEmailTransport } from '@/lib/services/email/config';

import { validateCustomMenuInput } from '@/features/Navigation/input';

import { requireAdmin, requireManageableUser } from '@/core/access/admin';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/core/supabase/admin';
import { getAuthEmailsByIds } from '@/core/supabase/auth-user-lookup.server';
import { readAllRows } from '@/core/supabase/read-all';
import { createSupabaseServerFetch } from '@/core/supabase/server-transport';
import { defaultLocale, isLocale } from '@/core/i18n/config';
import { resolveRecipientLocale } from '@/core/i18n/recipient-locale.server';
import type { UserRole } from '@/shared/types/interfaces';
import { sendTransactional } from '@/lib/services/email/resend';
import {
  renderWelcomeWithPassword,
  renderPurchaseConfirmed,
  renderExpirationWarning,
  renderMembershipWelcome,
  loadLocalizedTemplateContent,
  getEmailFrameContent,
  getEmailTemplateDefaults,
  saveTemplateContent,
  resetTemplateContent,
  TEMPLATE_KEYS,
  type TemplateKey,
  type WelcomeWithPasswordContent,
  type PurchaseConfirmedContent,
  type ExpirationWarningContent,
  type MembershipWelcomeContent,
} from '@/lib/services/email/templates';
import { loadTemplateContentForAdmin } from '@/lib/services/email/templates/load';
import { getTenantSettings } from '@/core/theme/settings';
import { resolveTenantSettings, TENANT_SETTINGS_COLUMNS } from '@/core/theme/branding';
import { parseAdminBranding } from '@/core/theme/admin-branding';
import { getInstallationConfig } from '@/core/config/installation.server';
import { getEmailBranding, resolveMembershipEmailLinks } from '@/lib/services/email/branding';
import {
  MENU_ICON_NAMES,
  type CustomMenuItem,
  type MenuIconName,
} from '@/features/Navigation/types';
import { generateTempPassword } from '@/shared/lib/generate-password';
import { sendEnrollmentEmail } from '@/lib/webhooks/processor';
import { applyManualEnrollment } from '@/features/Enrollment/manual.server';
import { AdminOverviewReadError } from './errors';
import { STUDENT_ROLES } from './student-roles';
import {
  ADMIN_EMAIL_TEMPLATE_CATALOG,
  type AdminEmailTemplate,
} from './email-template-catalog';
import {
  isImportReasonCode,
  type ImportReasonCode,
  type ImportReasonValues,
} from './import-contract';

export type {
  AdminEmailTemplate,
  AdminTemplateField,
} from './email-template-catalog';

// ─── Auth guard — only admin/super_admin may call these ─────────────────────



// ─── KPIs ────────────────────────────────────────────────────────────────────

export interface AdminKPIs {
  totalCourses: number;
  publishedCourses: number;
  totalStudents: number;
  newEnrollmentsThisWeek: number;
  totalLessons: number;
  activeWebhooks: number;
}

export async function getAdminKPIs(): Promise<AdminKPIs> {
  const { supabase } = await requireAdmin();

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const results = await Promise.all([
    supabase.from('courses').select('*', { count: 'exact', head: true }),
    supabase.from('courses').select('*', { count: 'exact', head: true }).eq('is_published', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', STUDENT_ROLES),
    supabase.from('enrollments').select('*', { count: 'exact', head: true }).gte('enrolled_at', oneWeekAgo),
    supabase.from('lessons').select('*', { count: 'exact', head: true }),
    supabase.from('webhook_configs').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  if (results.some((result) => result.error)) {
    throw new AdminOverviewReadError();
  }
  const [
    { count: totalCourses },
    { count: publishedCourses },
    { count: totalStudents },
    { count: newEnrollmentsThisWeek },
    { count: totalLessons },
    { count: activeWebhooks },
  ] = results;

  return {
    totalCourses: totalCourses ?? 0,
    publishedCourses: publishedCourses ?? 0,
    totalStudents: totalStudents ?? 0,
    newEnrollmentsThisWeek: newEnrollmentsThisWeek ?? 0,
    totalLessons: totalLessons ?? 0,
    activeWebhooks: activeWebhooks ?? 0,
  };
}

// ─── Recent enrollments ─────────────────────────────────────────────────────

export interface RecentEnrollment {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  accessLevelName: string;
  source: string;
  enrolledAt: string;
  isActive: boolean;
}

export async function getRecentEnrollments(limit = 10): Promise<RecentEnrollment[]> {
  const { supabase, adminClient } = await requireAdmin();

  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      id, user_id, source, enrolled_at, is_active,
      access_levels ( name )
    `)
    .order('enrolled_at', { ascending: false })
    .limit(limit);

  if (error) throw new AdminOverviewReadError();

  if (!data?.length) return [];

  // Fetch user info
  const userIds = [...new Set(data.map(r => r.user_id))];
  const [profilesRes, emailMap] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', userIds),
    getAuthEmailsByIds(adminClient.auth.admin, userIds),
  ]).catch(() => { throw new AdminOverviewReadError(); });
  if (profilesRes.error) {
    throw new AdminOverviewReadError();
  }

  const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p.display_name as string]));

  return data.map(r => ({
    id: r.id,
    userId: r.user_id,
    userEmail: emailMap.get(r.user_id) ?? '',
    userDisplayName: profileMap.get(r.user_id) ?? '',
    accessLevelName: (r.access_levels as unknown as { name: string } | null)?.name ?? '',
    source: r.source,
    enrolledAt: r.enrolled_at,
    isActive: r.is_active,
  }));
}

// ─── Course admin queries ───────────────────────────────────────────────────

export interface AdminCourse {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  isPublished: boolean;
  sortOrder: number;
  // Phase A fields
  thumbnailUrl: string | null;            // legacy, kept as fallback
  thumbnailLandscapeUrl: string | null;
  thumbnailPortraitUrl: string | null;
  heroBannerUrl: string | null;
  heroOverlayOpacity: number;
  heroShowText: boolean;
  trailerYoutubeId: string | null;
  trailerR2Key: string | null;
  instructorId: string | null;
  instructorName: string | null;
  instructorPortraitUrl: string | null;
  durationMinutes: number | null;
  isFeatured: boolean;
  isNew: boolean;
  isFree: boolean;
  isComingSoon: boolean;
  certificateEnabled: boolean;
  checkoutUrl: string | null;
  contentFormat: 'video' | 'ebook';
  // Aggregates
  moduleCount: number;
  lessonCount: number;
  enrollmentCount: number;
  createdAt: string;
}

export async function getAdminCourses(): Promise<AdminCourse[]> {
  const { supabase } = await requireAdmin();

  const courses = await readAllRows((from, to) => supabase
    .from('courses')
    .select(`
      id, title, slug, description, short_description, is_published, sort_order,
      thumbnail_url, thumbnail_landscape_url, thumbnail_portrait_url,
      hero_banner_url, hero_overlay_opacity, hero_show_text,
      trailer_youtube_id, trailer_r2_key, instructor_id, duration_minutes,
      is_featured, is_new, is_free, is_coming_soon, certificate_enabled, checkout_url, content_format, created_at,
      instructors ( id, name, portrait_url )
    `, { count: 'exact' })
    .order('sort_order').order('id').range(from, to), (row) => row.id)
    .catch(() => { throw new Error('loadFailed'); });

  if (!courses.length) return [];

  // The complete catalogue needs complete aggregates. Read each table in
  // stable pages rather than sending growing ID lists in query URLs.
  const [modules, lessons, courseMappings, enrollments] = await Promise.all([
    readAllRows((from, to) => supabase.from('modules').select('id, course_id', { count: 'exact' })
      .order('id').range(from, to), (row) => row.id),
    readAllRows((from, to) => supabase.from('lessons').select('id, module_id', { count: 'exact' })
      .order('id').range(from, to), (row) => row.id),
    readAllRows((from, to) => supabase.from('access_level_courses').select('access_level_id, course_id', { count: 'exact' })
      .order('access_level_id').order('course_id').range(from, to), (row) => `${row.access_level_id}:${row.course_id}`),
    readAllRows((from, to) => supabase.from('enrollments').select('id, access_level_id', { count: 'exact' })
      .eq('is_active', true).order('id').range(from, to), (row) => row.id),
  ]).catch(() => { throw new Error('loadFailed'); });

  // Module count per course
  const moduleCountMap = new Map<string, number>();
  for (const m of modules) {
    moduleCountMap.set(m.course_id, (moduleCountMap.get(m.course_id) ?? 0) + 1);
  }

  const moduleIdToCourseId = new Map(modules.map(m => [m.id, m.course_id]));

  const lessonCountMap = new Map<string, number>();
  for (const l of lessons) {
    const courseId = moduleIdToCourseId.get(l.module_id);
    if (courseId) {
      lessonCountMap.set(courseId, (lessonCountMap.get(courseId) ?? 0) + 1);
    }
  }

  // Enrollment count per course (through access_level_courses)
  const enrollmentCountMap = new Map<string, number>();
  const alToCourses = new Map<string, string[]>();
  for (const alc of courseMappings) {
    const existing = alToCourses.get(alc.access_level_id) ?? [];
    existing.push(alc.course_id);
    alToCourses.set(alc.access_level_id, existing);
  }

  for (const e of enrollments) {
    const relatedCourses = alToCourses.get(e.access_level_id) ?? [];
    for (const courseId of relatedCourses) {
      enrollmentCountMap.set(courseId, (enrollmentCountMap.get(courseId) ?? 0) + 1);
    }
  }

  return courses.map(c => {
    const instructor = c.instructors as unknown as
      | { id: string; name: string; portrait_url: string | null }
      | null;

    return {
      id: c.id,
      title: c.title,
      slug: c.slug,
      description: c.description,
      shortDescription: c.short_description,
      isPublished: c.is_published,
      sortOrder: c.sort_order,
      thumbnailUrl: c.thumbnail_url,
      thumbnailLandscapeUrl: c.thumbnail_landscape_url,
      thumbnailPortraitUrl: c.thumbnail_portrait_url,
      heroBannerUrl: c.hero_banner_url,
      heroOverlayOpacity: c.hero_overlay_opacity ?? 70,
      heroShowText: c.hero_show_text ?? true,
      trailerYoutubeId: c.trailer_youtube_id,
      trailerR2Key: c.trailer_r2_key,
      instructorId: c.instructor_id,
      instructorName: instructor?.name ?? null,
      instructorPortraitUrl: instructor?.portrait_url ?? null,
      durationMinutes: c.duration_minutes,
      isFeatured: c.is_featured,
      isNew: c.is_new,
      isFree: c.is_free,
      isComingSoon: c.is_coming_soon,
      certificateEnabled: c.certificate_enabled,
      checkoutUrl: c.checkout_url,
      contentFormat: ((c.content_format ?? 'video') as 'video' | 'ebook'),
      moduleCount: moduleCountMap.get(c.id) ?? 0,
      lessonCount: lessonCountMap.get(c.id) ?? 0,
      enrollmentCount: enrollmentCountMap.get(c.id) ?? 0,
      createdAt: c.created_at,
    };
  });
}

// ─── Student admin queries ──────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: 'active' | 'suspended';
  enrollmentCount: number;
  lastSignIn: string | null;
  createdAt: string;
  signupSource: string | null;
}

/** Inactivity bucket filter — mirrors the Reports page shortcut cards. */
export type StudentInactivityFilter =
  | 'never'
  | 'inactive_7'
  | 'inactive_30'
  | null;

export type StudentRoleFilter = 'all' | UserRole;
export type StudentStatusFilter = 'all' | 'active' | 'suspended';
export type StudentJoinedFilter = 'all' | '7d' | '30d' | '90d';
/** 'all' = no filter; 'youtube' = the YouTube free-PDF lead magnet. */
export type StudentSourceFilter = 'all' | 'youtube';

export interface AdminStudentFilters {
  search?: string;
  inactive?: StudentInactivityFilter;
  role?: StudentRoleFilter;
  status?: StudentStatusFilter;
  accessLevelId?: string | null;
  joinedSince?: StudentJoinedFilter;
  source?: StudentSourceFilter;
  page?: number;
}

// Not exported — 'use server' modules may only export async functions.
// The UI reads the effective page size off the returned payload instead.
const ADMIN_STUDENTS_PAGE_SIZE = 50;

export interface AdminStudentsPage {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getAdminStudents(
  searchOrFilters: string | AdminStudentFilters = '',
): Promise<AdminStudentsPage> {
  const filters: AdminStudentFilters =
    typeof searchOrFilters === 'string'
      ? { search: searchOrFilters }
      : searchOrFilters;
  const search = (filters.search ?? '').trim();
  const inactive = filters.inactive ?? null;
  const role = filters.role ?? 'all';
  const status = filters.status ?? 'all';
  const accessLevelId = filters.accessLevelId ?? null;
  const joinedSince = filters.joinedSince ?? 'all';
  const source = filters.source ?? 'all';
  const page = Math.max(1, Math.floor(filters.page ?? 1));

  const { supabase } = await requireAdmin();

  const daysByFilter = { '7d': 7, '30d': 30, '90d': 90 } as const;
  const { data, error } = await supabase.rpc('admin_search_students', {
    p_search: search,
    p_role: role,
    p_status: status,
    p_inactive: inactive,
    p_joined_days: joinedSince === 'all' ? null : daysByFilter[joinedSince],
    p_source: source,
    p_access_level_id: accessLevelId,
    p_page: page,
    p_page_size: ADMIN_STUDENTS_PAGE_SIZE,
  });
  if (error) {
    console.error('[admin] admin_search_students failed:', error);
    throw new Error('Failed to load students');
  }

  const rows = (data ?? []) as Array<{
    id: string;
    email: string;
    display_name: string;
    role: string;
    status: string;
    created_at: string;
    last_sign_in_at: string | null;
    signup_source: string | null;
    enrollment_count: number;
    total_count: number;
  }>;

  return {
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      role: r.role as UserRole,
      status: (r.status as 'active' | 'suspended') ?? 'active',
      enrollmentCount: Number(r.enrollment_count),
      lastSignIn: r.last_sign_in_at,
      createdAt: r.created_at,
      signupSource: r.signup_source,
    })),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    page,
    pageSize: ADMIN_STUDENTS_PAGE_SIZE,
  };
}


// ─── Access levels queries ──────────────────────────────────────────────────

export interface AdminAccessLevel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  courseNames: string[];
  courseIds: string[];
  enrollmentCount: number;
}

export async function getAdminAccessLevels(): Promise<AdminAccessLevel[]> {
  const { supabase } = await requireAdmin();

  const accessLevels = await readAllRows((from, to) => supabase
    .from('access_levels')
    .select('id, name, slug, description', { count: 'exact' })
    .order('name').order('id').range(from, to), (row) => row.id)
    .catch(() => { throw new Error('loadFailed'); });

  if (!accessLevels.length) return [];

  const [courseMappings, enrollments, courses] = await Promise.all([
    readAllRows((from, to) => supabase.from('access_level_courses').select('access_level_id, course_id', { count: 'exact' })
      .order('access_level_id').order('course_id').range(from, to), (row) => `${row.access_level_id}:${row.course_id}`),
    readAllRows((from, to) => supabase.from('enrollments').select('id, access_level_id', { count: 'exact' })
      .eq('is_active', true).order('id').range(from, to), (row) => row.id),
    readAllRows((from, to) => supabase.from('courses').select('id, title', { count: 'exact' })
      .order('id').range(from, to), (row) => row.id),
  ]).catch(() => { throw new Error('loadFailed'); });
  const courseNameMap = new Map(courses.map(c => [c.id, c.title]));

  // Build mappings per access level
  const alCourseMap = new Map<string, { ids: string[]; names: string[] }>();
  for (const m of courseMappings) {
    const existing = alCourseMap.get(m.access_level_id) ?? { ids: [], names: [] };
    existing.ids.push(m.course_id);
    existing.names.push(courseNameMap.get(m.course_id) ?? '');
    alCourseMap.set(m.access_level_id, existing);
  }

  // Enrollment counts
  const enrollmentCountMap = new Map<string, number>();
  for (const e of enrollments) {
    enrollmentCountMap.set(e.access_level_id, (enrollmentCountMap.get(e.access_level_id) ?? 0) + 1);
  }

  return accessLevels.map(al => ({
    id: al.id,
    name: al.name,
    slug: al.slug,
    description: al.description,
    courseNames: alCourseMap.get(al.id)?.names ?? [],
    courseIds: alCourseMap.get(al.id)?.ids ?? [],
    enrollmentCount: enrollmentCountMap.get(al.id) ?? 0,
  }));
}

// ─── Enrollment queries ─────────────────────────────────────────────────────

export interface AdminEnrollment {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  accessLevelName: string;
  accessLevelId: string;
  source: string;
  enrolledAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

export async function getAdminEnrollments(filter: 'all' | 'active' | 'inactive' = 'all', limit = 50): Promise<AdminEnrollment[]> {
  const { supabase, adminClient } = await requireAdmin();

  let query = supabase
    .from('enrollments')
    .select(`
      id, user_id, access_level_id, source, enrolled_at, expires_at, is_active,
      access_levels ( name )
    `)
    .order('enrolled_at', { ascending: false })
    .limit(limit);

  if (filter === 'active') query = query.eq('is_active', true);
  if (filter === 'inactive') query = query.eq('is_active', false);

  const { data, error } = await query;
  if (error) throw new Error('loadFailed');
  if (!data?.length) return [];

  const userIds = [...new Set(data.map(r => r.user_id))];
  const [profilesRes, emailMap] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', userIds),
    getAuthEmailsByIds(adminClient.auth.admin, userIds),
  ]).catch(() => { throw new Error('loadFailed'); });

  if (profilesRes.error) throw new Error('loadFailed');
  const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p.display_name as string]));

  return data.map(r => ({
    id: r.id,
    userId: r.user_id,
    userEmail: emailMap.get(r.user_id) ?? '',
    userDisplayName: profileMap.get(r.user_id) ?? '',
    accessLevelName: (r.access_levels as unknown as { name: string } | null)?.name ?? '',
    accessLevelId: r.access_level_id,
    source: r.source,
    enrolledAt: r.enrolled_at,
    expiresAt: r.expires_at,
    isActive: r.is_active,
  }));
}

// ─── Search user by email ───────────────────────────────────────────────────

export async function searchUserByEmail(email: string): Promise<{ id: string; email: string; displayName: string } | null> {
  const { adminClient, supabase } = await requireAdmin();

  const normalizedEmail = email.trim().toLowerCase();
  if (!isEmailShape(normalizedEmail)) return null;
  const { data: userId, error: lookupError } = await adminClient.rpc('get_user_id_by_email', {
    p_email: normalizedEmail,
  });
  if (lookupError) throw new Error('loadFailed');
  if (!userId) return null;

  const emails = await getAuthEmailsByIds(adminClient.auth.admin, [userId])
    .catch(() => { throw new Error('loadFailed'); });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single();

  if (profileError) throw new Error('loadFailed');
  return {
    id: userId,
    email: emails.get(userId) ?? '',
    displayName: (profile?.display_name as string) ?? '',
  };
}

// ─── Webhook config queries ─────────────────────────────────────────────────

export interface AdminWebhookConfig {
  id: string;
  provider: string;
  name: string;
  accessLevelName: string;
  accessLevelId: string;
  expirationDays: number | null;
  isActive: boolean;
  createdAt: string;
  /** URL-embedded token for token-auth providers (Guru). Opaque to admins. */
  urlToken: string | null;
  /** For providers without HMAC signing, binds payloads to this producer/account ID. */
  expectedProducerId: string | null;
}

export async function getAdminWebhookConfigs(): Promise<AdminWebhookConfig[]> {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from('webhook_configs')
    .select(`
      id, provider, name, access_level_id, expiration_days, is_active, created_at,
      secret_key, expected_producer_id,
      access_levels ( name )
    `)
    .order('created_at', { ascending: false });

  if (error) throw new Error('loadFailed');

  return (data ?? []).map(w => ({
    id: w.id,
    provider: w.provider,
    name: w.name,
    accessLevelName: (w.access_levels as unknown as { name: string } | null)?.name ?? '',
    accessLevelId: w.access_level_id,
    expirationDays: w.expiration_days,
    isActive: w.is_active,
    createdAt: w.created_at,
    // A URL token must be displayed so an administrator can copy the
    // generated endpoint. Signing and bearer secrets never leave the server.
    urlToken:
      w.provider === 'guru'
        ? ((w.secret_key as string | null) ?? null)
        : null,
    expectedProducerId: (w.expected_producer_id as string | null) ?? null,
  }));
}

/**
 * URL-safe 32-char token with ~192 bits of entropy. Used as the
 * webhook URL segment for token-auth providers (Guru). crypto.randomBytes
 * returns a Buffer — base64url encoding keeps it compact and path-safe.
 */
function generateWebhookToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export async function createWebhookConfig(data: {
  provider: string;
  name: string;
  secretKey?: string;
  /** Optional. When null, unmapped products reject with an error (recommended). */
  accessLevelId: string | null;
  expirationDays?: number;
  expectedProducerId?: string | null;
}) {
  const { supabase } = await requireAdmin();

  if (!['stripe', 'guru', 'generic'].includes(data.provider)) {
    return { error: 'invalidProvider' };
  }
  const name = data.name.trim();
  if (!name) return { error: 'invalidInput' };
  if (
    data.expirationDays !== undefined &&
    (!Number.isInteger(data.expirationDays) || data.expirationDays < 0)
  ) {
    return { error: 'invalidExpiration' };
  }

  // For token-auth providers (Guru) the admin doesn't paste anything —
  // the server mints a random token. Stripe/generic still accept an
  // admin-supplied secret (whsec_... or a bearer they chose).
  const providersWithAutoToken = new Set(['guru']);
  const secretKey = providersWithAutoToken.has(data.provider)
    ? generateWebhookToken()
    : data.secretKey;

  if (!secretKey) {
    return { error: 'secretRequired' };
  }

  const { data: created, error } = await supabase
    .from('webhook_configs')
    .insert({
      provider: data.provider,
      name,
      secret_key: secretKey,
      access_level_id: data.accessLevelId,
      expiration_days: data.expirationDays ?? null,
      expected_producer_id: data.expectedProducerId?.trim() || null,
      is_active: true,
      config: {},
    })
    .select('id')
    .single();

  if (error || !created) return { error: 'operationFailed' };
  return { success: true };
}

export async function updateWebhookConfig(id: string, data: {
  name?: string;
  secretKey?: string;
  accessLevelId?: string | null;
  expirationDays?: number | null;
  expectedProducerId?: string | null;
}) {
  const { supabase } = await requireAdmin();

  if (
    data.expirationDays !== undefined &&
    data.expirationDays !== null &&
    (!Number.isInteger(data.expirationDays) || data.expirationDays < 0)
  ) {
    return { error: 'invalidExpiration' };
  }

  const updateObj: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) return { error: 'invalidInput' };
    updateObj.name = name;
  }
  if (data.secretKey !== undefined) updateObj.secret_key = data.secretKey;
  if (data.accessLevelId !== undefined) updateObj.access_level_id = data.accessLevelId;
  if (data.expirationDays !== undefined) updateObj.expiration_days = data.expirationDays;
  if (data.expectedProducerId !== undefined)
    updateObj.expected_producer_id = data.expectedProducerId?.trim() || null;

  if (Object.keys(updateObj).length === 0) return { error: 'invalidInput' };

  const { data: updated, error } = await supabase
    .from('webhook_configs')
    .update(updateObj)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!updated) return { error: 'notFound' };
  return { success: true };
}

const ROTATION_GRACE_MS = 5 * 60 * 1000;

/**
 * Rotate the URL-embedded token for a token-auth provider. The OLD
 * token stays valid for ROTATION_GRACE_MS after the swap so the admin
 * has time to paste the new URL into the gateway without dropping
 * in-flight events. Once the grace window expires, the old token
 * becomes inert — webhook_cleanup clears the columns, or the next
 * rotation overwrites them.
 */
export async function rotateWebhookToken(
  id: string,
): Promise<{ success: true; token: string } | { error: string }> {
  const { supabase } = await requireAdmin();

  const { data: current, error: currentError } = await supabase
    .from('webhook_configs')
    .select('secret_key')
    .eq('id', id)
    .single();

  if (currentError) {
    return {
      error: currentError.code === 'PGRST116' ? 'notFound' : 'operationFailed',
    };
  }

  if (!current?.secret_key) {
    return { error: 'notFound' };
  }

  const newToken = generateWebhookToken();
  const graceExpiresAt = new Date(Date.now() + ROTATION_GRACE_MS).toISOString();

  const { data: updated, error } = await supabase
    .from('webhook_configs')
    .update({
      secret_key: newToken,
      previous_secret_key: current.secret_key,
      previous_secret_expires_at: graceExpiresAt,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!updated) return { error: 'notFound' };
  revalidatePath('/admin/integrations');
  return { success: true, token: newToken };
}

export async function deleteWebhookConfig(id: string) {
  const { supabase } = await requireAdmin();

  const { data: deleted, error } = await supabase
    .from('webhook_configs')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!deleted) return { error: 'notFound' };
  return { success: true };
}

export async function toggleWebhookActive(id: string) {
  const { supabase } = await requireAdmin();

  const { data: config, error: configError } = await supabase
    .from('webhook_configs')
    .select('is_active')
    .eq('id', id)
    .single();

  if (configError) {
    return {
      error: configError.code === 'PGRST116' ? 'notFound' : 'operationFailed',
    };
  }
  if (!config) return { error: 'notFound' };

  const { data: updated, error } = await supabase
    .from('webhook_configs')
    .update({ is_active: !config.is_active })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!updated) return { error: 'notFound' };
  return { success: true, data: { isActive: !config.is_active } };
}

// ─── Webhook product mappings ──────────────────────────────────────────────

export type OfferSalesMode = 'one_time' | 'subscription';

export interface AdminOfferCourse {
  id: string;
  title: string;
}

export interface AdminWebhookProductMapping {
  id: string;
  webhookConfigId: string;
  externalProductId: string;
  accessLevelId: string;
  salesMode: OfferSalesMode;
  expirationDays: number | null;
  title: string | null;
  tags: string[];
  courses: AdminOfferCourse[];
  cohortAssignments: OfferCohortAssignment[];
  isActive: boolean;
  createdAt: string;
}

export async function getAdminWebhookProductMappings(
  webhookConfigId: string,
): Promise<AdminWebhookProductMapping[]> {
  const { supabase } = await requireAdmin();

  const { data: rows, error: rowsError } = await supabase
    .from('webhook_product_mappings')
    .select(`
      id, webhook_config_id, external_product_id, access_level_id,
      sales_mode, expiration_days, title, tags, is_active, created_at
    `)
    .eq('webhook_config_id', webhookConfigId)
    .order('created_at', { ascending: false });

  if (rowsError) throw new Error('loadFailed');
  if (!rows?.length) return [];

  const accessLevelIds = Array.from(
    new Set(rows.map((r) => r.access_level_id as string)),
  );
  const mappingIds = rows.map((r) => r.id as string);

  // Courses attached to each access_level. One query, group client-side.
  const [alCoursesRes, coursesRes, cohortsRes] = await Promise.all([
    supabase
      .from('access_level_courses')
      .select('access_level_id, course_id')
      .in('access_level_id', accessLevelIds),
    supabase.from('courses').select('id, title'),
    supabase
      .from('webhook_product_mapping_cohorts')
      .select('mapping_id, course_id, cohort_id')
      .in('mapping_id', mappingIds),
  ]);

  if (alCoursesRes.error || coursesRes.error || cohortsRes.error) throw new Error('loadFailed');
  const courseTitleById = new Map<string, string>();
  for (const c of coursesRes.data ?? []) {
    courseTitleById.set(c.id as string, c.title as string);
  }

  const coursesByAccessLevel = new Map<string, AdminOfferCourse[]>();
  for (const row of alCoursesRes.data ?? []) {
    const alId = row.access_level_id as string;
    const courseId = row.course_id as string;
    const list = coursesByAccessLevel.get(alId) ?? [];
    list.push({
      id: courseId,
      title: courseTitleById.get(courseId) ?? '',
    });
    coursesByAccessLevel.set(alId, list);
  }

  const cohortsByMapping = new Map<string, OfferCohortAssignment[]>();
  for (const row of cohortsRes.data ?? []) {
    const mId = row.mapping_id as string;
    const list = cohortsByMapping.get(mId) ?? [];
    list.push({
      courseId: row.course_id as string,
      cohortId: row.cohort_id as string,
    });
    cohortsByMapping.set(mId, list);
  }

  return rows.map((m) => ({
    id: m.id,
    webhookConfigId: m.webhook_config_id,
    externalProductId: m.external_product_id,
    accessLevelId: m.access_level_id,
    salesMode: (m.sales_mode as OfferSalesMode) ?? 'one_time',
    expirationDays: m.expiration_days,
    title: m.title,
    tags: (m.tags as string[] | null) ?? [],
    courses: coursesByAccessLevel.get(m.access_level_id as string) ?? [],
    cohortAssignments: cohortsByMapping.get(m.id as string) ?? [],
    isActive: m.is_active,
    createdAt: m.created_at,
  }));
}

export interface AdminCourseLite {
  id: string;
  title: string;
  slug: string;
}

/**
 * Offer row enriched with the provider + display name of its webhook_config.
 * Used by the unified /admin/offers list (cross-provider view).
 */
export interface AdminOfferWithProvider extends AdminWebhookProductMapping {
  providerId: string;
  providerName: string;
}

/**
 * Cross-provider offer list — every offer from every webhook_config, sorted
 * by creation date. Powers the unified /admin/offers page.
 */
export async function getAllOffers(): Promise<AdminOfferWithProvider[]> {
  const { supabase } = await requireAdmin();

  const { data: configs, error: configsError } = await supabase
    .from('webhook_configs')
    .select('id, provider, name');

  if (configsError) throw new Error('loadFailed');
  const configById = new Map<
    string,
    { provider: string; name: string }
  >();
  for (const c of configs ?? []) {
    configById.set(c.id as string, {
      provider: c.provider as string,
      name: (c.name as string) ?? (c.provider as string),
    });
  }

  const { data: rows, error: rowsError } = await supabase
    .from('webhook_product_mappings')
    .select(
      'id, webhook_config_id, external_product_id, access_level_id, sales_mode, expiration_days, title, tags, is_active, created_at',
    )
    .order('created_at', { ascending: false });

  if (rowsError) throw new Error('loadFailed');
  if (!rows?.length) return [];

  const accessLevelIds = Array.from(
    new Set(rows.map((r) => r.access_level_id as string)),
  );
  const mappingIds = rows.map((r) => r.id as string);

  const [alCoursesRes, coursesRes, cohortsRes] = await Promise.all([
    supabase
      .from('access_level_courses')
      .select('access_level_id, course_id')
      .in('access_level_id', accessLevelIds),
    supabase.from('courses').select('id, title'),
    supabase
      .from('webhook_product_mapping_cohorts')
      .select('mapping_id, course_id, cohort_id')
      .in('mapping_id', mappingIds),
  ]);

  if (alCoursesRes.error || coursesRes.error || cohortsRes.error) throw new Error('loadFailed');
  const courseTitleById = new Map<string, string>();
  for (const c of coursesRes.data ?? []) {
    courseTitleById.set(c.id as string, c.title as string);
  }

  const coursesByAccessLevel = new Map<string, AdminOfferCourse[]>();
  for (const row of alCoursesRes.data ?? []) {
    const alId = row.access_level_id as string;
    const list = coursesByAccessLevel.get(alId) ?? [];
    list.push({
      id: row.course_id as string,
      title: courseTitleById.get(row.course_id as string) ?? '',
    });
    coursesByAccessLevel.set(alId, list);
  }

  const cohortsByMapping = new Map<string, OfferCohortAssignment[]>();
  for (const row of cohortsRes.data ?? []) {
    const mId = row.mapping_id as string;
    const list = cohortsByMapping.get(mId) ?? [];
    list.push({
      courseId: row.course_id as string,
      cohortId: row.cohort_id as string,
    });
    cohortsByMapping.set(mId, list);
  }

  return rows.map((m) => {
    const config = configById.get(m.webhook_config_id as string);
    return {
      id: m.id,
      webhookConfigId: m.webhook_config_id,
      externalProductId: m.external_product_id,
      accessLevelId: m.access_level_id,
      salesMode: (m.sales_mode as OfferSalesMode) ?? 'one_time',
      expirationDays: m.expiration_days,
      title: m.title,
      tags: (m.tags as string[] | null) ?? [],
      courses: coursesByAccessLevel.get(m.access_level_id as string) ?? [],
      cohortAssignments: cohortsByMapping.get(m.id as string) ?? [],
      isActive: m.is_active,
      createdAt: m.created_at,
      providerId: config?.provider ?? 'generic',
      providerName: config?.name ?? '',
    };
  });
}

/**
 * Lightweight course list for the offer form — returns only what the picker
 * needs (id, title, slug). Published + unpublished both show up because an
 * admin may want to pre-configure an offer for a course that isn't live yet.
 */
export async function getAdminCoursesLite(): Promise<AdminCourseLite[]> {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from('courses')
    .select('id, title, slug')
    .order('sort_order', { ascending: true });

  if (error) throw new Error('loadFailed');
  return (data ?? []).map((c) => ({
    id: c.id as string,
    title: c.title as string,
    slug: c.slug as string,
  }));
}

export async function createWebhookProductMapping(data: {
  webhookConfigId: string;
  externalProductId: string;
  accessLevelId: string;
  salesMode: OfferSalesMode;
  expirationDays?: number | null;
  title?: string | null;
}) {
  const { supabase } = await requireAdmin();

  const trimmed = data.externalProductId.trim();
  if (!trimmed) return { error: 'External product ID is required' };
  if (!data.accessLevelId) return { error: 'Access level is required' };

  // Subscription offers ignore expiration_days — webhook events drive it.
  const expirationDays =
    data.salesMode === 'subscription'
      ? null
      : (data.expirationDays ?? null);

  const { error } = await supabase.from('webhook_product_mappings').insert({
    webhook_config_id: data.webhookConfigId,
    external_product_id: trimmed,
    access_level_id: data.accessLevelId,
    sales_mode: data.salesMode,
    expiration_days: expirationDays,
    title: data.title?.trim() || null,
    is_active: true,
  });

  if (error) {
    // Unique violation on (webhook_config_id, external_product_id)
    if (error.code === '23505') {
      return { error: 'A mapping for this product already exists' };
    }
    return { error: error.message };
  }
  return { success: true };
}

export async function updateWebhookProductMapping(
  id: string,
  data: {
    externalProductId: string;
    accessLevelId: string;
    salesMode: OfferSalesMode;
    expirationDays?: number | null;
    title?: string | null;
  },
) {
  const { supabase } = await requireAdmin();

  const trimmed = data.externalProductId.trim();
  if (!trimmed) return { error: 'External product ID is required' };
  if (!data.accessLevelId) return { error: 'Access level is required' };

  const expirationDays =
    data.salesMode === 'subscription'
      ? null
      : (data.expirationDays ?? null);

  const { error } = await supabase
    .from('webhook_product_mappings')
    .update({
      external_product_id: trimmed,
      access_level_id: data.accessLevelId,
      sales_mode: data.salesMode,
      expiration_days: expirationDays,
      title: data.title?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { error: 'A mapping for this product already exists' };
    }
    return { error: error.message };
  }
  return { success: true };
}

export async function deleteWebhookProductMapping(id: string) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from('webhook_product_mappings')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function toggleWebhookProductMappingActive(id: string) {
  const { supabase } = await requireAdmin();

  const { data: row, error: lookupError } = await supabase
    .from('webhook_product_mappings')
    .select('is_active')
    .eq('id', id)
    .single();

  if (lookupError || !row) return { error: 'offerMissing' };

  const { data: updated, error } = await supabase
    .from('webhook_product_mappings')
    .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error || !updated) return { error: 'offerFailed' };
  return { success: true, data: { isActive: !row.is_active } };
}

// ─── Offers (courses + cohorts + tags, hides access_level plumbing) ────────
//
// The offer form asks for courses directly — admins don't think in "access
// levels". Internally each offer still owns a hidden access_level so that
// enrollments / RLS don't need to change:
//
//   offer (webhook_product_mappings row)
//     └─→ access_level (auto-created, name mirrors the offer title)
//           └─→ access_level_courses (one row per course the offer grants)
//
// Plus an optional per-(offer, course) cohort in webhook_product_mapping_cohorts,
// which the webhook processor reads when creating enrollment_cohorts rows.

export interface OfferCohortAssignment {
  courseId: string;
  cohortId: string;
}

export interface CreateOfferInput {
  webhookConfigId: string;
  externalProductId: string;
  title: string | null;
  salesMode: OfferSalesMode;
  expirationDays?: number | null;
  courseIds: string[];
  cohortAssignments?: OfferCohortAssignment[];
  tags?: string[];
}

export interface UpdateOfferInput {
  externalProductId: string;
  title: string | null;
  salesMode: OfferSalesMode;
  expirationDays?: number | null;
  courseIds: string[];
  cohortAssignments?: OfferCohortAssignment[];
  tags?: string[];
}

function offerAccessLevelName(title: string | null, externalProductId: string): string {
  const trimmed = title?.trim();
  return trimmed || externalProductId;
}

function generateOfferSlug(): string {
  // crypto.randomUUID() is available in Node 18+; short suffix keeps
  // access_levels.slug readable in the DB without collisions.
  return `offer-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeTags(tags: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (tags ?? [])
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    ),
  );
}

export async function createOfferWithCourses(input: CreateOfferInput) {
  const { supabase } = await requireAdmin();

  const externalProductId = input.externalProductId.trim();
  if (!externalProductId) return { error: 'productIdRequired' };
  if (input.courseIds.length === 0) {
    return { error: 'coursesRequired' };
  }

  const salesMode = input.salesMode;
  const expirationDays =
    salesMode === 'subscription' ? null : input.expirationDays ?? null;
  const tags = normalizeTags(input.tags);

  // 1. Create the hidden access_level that this offer owns.
  const { data: accessLevel, error: levelError } = await supabase
    .from('access_levels')
    .insert({
      name: offerAccessLevelName(input.title, externalProductId),
      slug: generateOfferSlug(),
      description: null,
    })
    .select('id')
    .single();

  if (levelError || !accessLevel) {
    return { error: 'offerFailed' };
  }

  // 2. Map courses to the access_level.
  const { error: mapError } = await supabase
    .from('access_level_courses')
    .insert(
      input.courseIds.map((courseId) => ({
        access_level_id: accessLevel.id,
        course_id: courseId,
      })),
    );

  if (mapError) {
    // Roll back the access_level so we don't leave orphans on failure.
    await supabase.from('access_levels').delete().eq('id', accessLevel.id);
    return { error: 'offerFailed' };
  }

  // 3. Create the offer row itself.
  const { data: mapping, error: mappingError } = await supabase
    .from('webhook_product_mappings')
    .insert({
      webhook_config_id: input.webhookConfigId,
      external_product_id: externalProductId,
      access_level_id: accessLevel.id,
      sales_mode: salesMode,
      expiration_days: expirationDays,
      title: input.title?.trim() || null,
      tags,
      is_active: true,
    })
    .select('id')
    .single();

  if (mappingError || !mapping) {
    // Clean up — mapping is the last piece so drop the level + course map.
    await supabase.from('access_levels').delete().eq('id', accessLevel.id);
    if (mappingError?.code === '23505') {
      return { error: 'offerExists' };
    }
    return { error: 'offerFailed' };
  }

  // 4. Persist per-course cohort assignments (only those referencing chosen courses).
  const validCourseIds = new Set(input.courseIds);
  const cohortRows = (input.cohortAssignments ?? [])
    .filter((a) => validCourseIds.has(a.courseId))
    .map((a) => ({
      mapping_id: mapping.id,
      course_id: a.courseId,
      cohort_id: a.cohortId,
    }));

  if (cohortRows.length > 0) {
    const { error: cohortError } = await supabase
      .from('webhook_product_mapping_cohorts')
      .insert(cohortRows);

    if (cohortError) {
      // Non-fatal — the offer still works, just without cohort auto-assign.
      // Surface the error so the admin can retry.
      return {
        success: true,
        warning: 'offerCohortsFailed',
      };
    }
  }

  revalidatePath('/admin/integrations');
  return { success: true, data: { id: mapping.id } };
}

export async function updateOfferWithCourses(
  mappingId: string,
  input: UpdateOfferInput,
) {
  const { supabase } = await requireAdmin();

  const externalProductId = input.externalProductId.trim();
  if (!externalProductId) return { error: 'productIdRequired' };
  if (input.courseIds.length === 0) {
    return { error: 'coursesRequired' };
  }

  const salesMode = input.salesMode;
  const expirationDays =
    salesMode === 'subscription' ? null : input.expirationDays ?? null;
  const tags = normalizeTags(input.tags);

  // 1. Load the mapping so we know which access_level it owns.
  const { data: existing, error: loadError } = await supabase
    .from('webhook_product_mappings')
    .select('id, access_level_id')
    .eq('id', mappingId)
    .single();

  if (loadError || !existing) {
    return { error: 'offerFailed' };
  }

  const accessLevelId = existing.access_level_id as string;

  // 2. Re-sync the access_level name + linked courses (immediate effect
  // on every existing enrollment that holds this access_level).
  const { error: renameError } = await supabase
    .from('access_levels')
    .update({
      name: offerAccessLevelName(input.title, externalProductId),
    })
    .eq('id', accessLevelId);

  if (renameError) return { error: 'offerFailed' };

  const { error: clearError } = await supabase
    .from('access_level_courses')
    .delete()
    .eq('access_level_id', accessLevelId);

  if (clearError) return { error: 'offerFailed' };

  const { error: insertError } = await supabase
    .from('access_level_courses')
    .insert(
      input.courseIds.map((courseId) => ({
        access_level_id: accessLevelId,
        course_id: courseId,
      })),
    );

  if (insertError) return { error: 'offerFailed' };

  // 3. Update the offer row.
  const { error: updateError } = await supabase
    .from('webhook_product_mappings')
    .update({
      external_product_id: externalProductId,
      sales_mode: salesMode,
      expiration_days: expirationDays,
      title: input.title?.trim() || null,
      tags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mappingId);

  if (updateError) {
    if (updateError.code === '23505') {
      return { error: 'offerExists' };
    }
    return { error: 'offerFailed' };
  }

  // 4. Re-sync per-course cohort assignments.
  const { error: wipeCohortsError } = await supabase
    .from('webhook_product_mapping_cohorts')
    .delete()
    .eq('mapping_id', mappingId);

  if (wipeCohortsError) return { error: 'offerFailed' };

  const validCourseIds = new Set(input.courseIds);
  const cohortRows = (input.cohortAssignments ?? [])
    .filter((a) => validCourseIds.has(a.courseId))
    .map((a) => ({
      mapping_id: mappingId,
      course_id: a.courseId,
      cohort_id: a.cohortId,
    }));

  if (cohortRows.length > 0) {
    const { error: cohortError } = await supabase
      .from('webhook_product_mapping_cohorts')
      .insert(cohortRows);

    if (cohortError) {
      return {
        success: true,
        warning: 'offerCohortsFailed',
      };
    }
  }

  revalidatePath('/admin/integrations');
  return { success: true };
}

export async function deleteOfferWithCourses(mappingId: string) {
  const { supabase } = await requireAdmin();

  // Capture the linked access_level so we can clean it up if nobody else
  // depends on it. Deleting the mapping first removes cohort assignments
  // via ON DELETE CASCADE.
  const { data: existing, error: lookupError } = await supabase
    .from('webhook_product_mappings')
    .select('access_level_id')
    .eq('id', mappingId)
    .single();

  if (lookupError || !existing) return { error: 'offerMissing' };

  const { data: deletedOffer, error: deleteError } = await supabase
    .from('webhook_product_mappings')
    .delete()
    .eq('id', mappingId).select('id').maybeSingle();

  if (deleteError || !deletedOffer) return { error: 'offerFailed' };

  if (existing?.access_level_id) {
    // If no enrollments or other mappings reference this access_level, drop it
    // so the DB doesn't accumulate orphaned "Offer · ..." rows. If anything
    // still depends on it (existing students who bought through this offer),
    // leave it alone — revoking their access isn't our decision here.
    const accessLevelId = existing.access_level_id as string;

    const [{ count: enrollmentCount }, { count: mappingCount }] =
      await Promise.all([
        supabase
          .from('enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('access_level_id', accessLevelId),
        supabase
          .from('webhook_product_mappings')
          .select('id', { count: 'exact', head: true })
          .eq('access_level_id', accessLevelId),
      ]);

    if ((enrollmentCount ?? 0) === 0 && (mappingCount ?? 0) === 0) {
      await supabase
        .from('access_level_courses')
        .delete()
        .eq('access_level_id', accessLevelId);
      await supabase
        .from('access_levels')
        .delete()
        .eq('id', accessLevelId);
    }
  }

  revalidatePath('/admin/integrations');
  return { success: true };
}

// ─── Webhook logs ───────────────────────────────────────────────────────────

export interface AdminWebhookLog {
  id: string;
  provider: string;
  eventType: string;
  status: string;
  payload: string;
  errorMessage: string | null;
  createdAt: string;
}

// ─── Webhook dead-letter queue ─────────────────────────────────────

export interface AdminDeadLetter {
  id: string;
  webhookConfigId: string | null;
  provider: string;
  eventType: string;
  attemptCount: number;
  status: 'pending' | 'processed' | 'abandoned';
  lastError: string | null;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  /** Stringified for the admin table; full object available via expand. */
  payloadPreview: string;
}

export interface WebhookAnomaly {
  provider: string;
  authFailedLastHour: number;
  /** 'probing' when we think someone is guessing tokens; 'retry_storm' for runaway retries. */
  kind: 'probing' | 'retry_storm';
  threshold: number;
}

/**
 * Surface clusters of auth_failed / rate_limited events that look like
 * abuse rather than normal traffic. Runs cheaply on webhook_logs —
 * no new tables.
 *
 * Thresholds are intentionally conservative; a handful of stale-URL
 * retries shouldn't cry wolf. Tenants with real traffic will see the
 * signal only when something is genuinely off.
 */
export async function getWebhookAnomalies(): Promise<WebhookAnomaly[]> {
  const { supabase } = await requireAdmin();

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('webhook_logs')
    .select('provider, event_type')
    .gte('created_at', hourAgo)
    .in('event_type', ['auth_failed', 'rate_limited']);

  if (error) throw new Error('loadFailed');

  const counts = new Map<string, { authFailed: number; rateLimited: number }>();
  for (const row of data ?? []) {
    const cur = counts.get(row.provider) ?? { authFailed: 0, rateLimited: 0 };
    if (row.event_type === 'auth_failed') cur.authFailed += 1;
    else cur.rateLimited += 1;
    counts.set(row.provider, cur);
  }

  const anomalies: WebhookAnomaly[] = [];
  for (const [provider, c] of counts) {
    if (c.authFailed >= 20) {
      anomalies.push({
        provider,
        authFailedLastHour: c.authFailed,
        kind: 'probing',
        threshold: 20,
      });
    }
    if (c.rateLimited >= 10) {
      anomalies.push({
        provider,
        authFailedLastHour: c.rateLimited,
        kind: 'retry_storm',
        threshold: 10,
      });
    }
  }
  return anomalies;
}

export async function getAdminDeadLetters(
  status: 'pending' | 'abandoned' | 'all' = 'all',
  limit = 50,
): Promise<AdminDeadLetter[]> {
  const { supabase } = await requireAdmin();

  let query = supabase
    .from('webhook_dead_letters')
    .select(
      'id, webhook_config_id, provider, event_type, attempt_count, status, last_error, next_attempt_at, created_at, updated_at, payload',
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;

  if (error) throw new Error('loadFailed');

  return (data ?? []).map((r) => ({
    id: r.id,
    webhookConfigId: r.webhook_config_id,
    provider: r.provider,
    eventType: r.event_type,
    attemptCount: r.attempt_count,
    status: r.status as AdminDeadLetter['status'],
    lastError: r.last_error,
    nextAttemptAt: r.next_attempt_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    payloadPreview: JSON.stringify(r.payload).slice(0, 200),
  }));
}

export async function retryDeadLetterNow(id: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('webhook_dead_letters')
    .update({ next_attempt_at: new Date().toISOString(), status: 'pending' })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'operationFailed' };
  if (!data) return { error: 'notFound' };
  revalidatePath('/admin/integrations');
  return { success: true };
}

export async function deleteDeadLetter(id: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('webhook_dead_letters')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'operationFailed' };
  if (!data) return { error: 'notFound' };
  revalidatePath('/admin/integrations');
  return { success: true };
}

export async function getAdminWebhookLogs(limit = 50): Promise<AdminWebhookLog[]> {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from('webhook_logs')
    .select('id, provider, event_type, status, payload, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error('loadFailed');

  return (data ?? []).map(l => ({
    id: l.id,
    provider: l.provider,
    eventType: l.event_type,
    status: l.status,
    payload: typeof l.payload === 'string' ? l.payload : JSON.stringify(l.payload),
    errorMessage: l.error_message,
    createdAt: l.created_at,
  }));
}

// ─── Branding / Tenant settings ─────────────────────────────────────────────

export interface AdminBrandingSettings {
  id: string;
  siteName: string;
  // Identity
  logoUrl: string | null;        // legacy single logo — kept as fallback
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  // Colors
  primaryColor: string;
  accentColor: string;
  secondaryColor: string;        // legacy — kept for backwards compat
  fontFamily: string;
  // Home hero
  homeHeroBannerUrl: string | null;
  homeHeroTrailerYoutubeId: string | null;
  homeHeroTitle: string | null;
  homeHeroSubtitle: string | null;
  /** 0..100 — darkness of the gradient overlay on the dashboard hero. */
  homeHeroOverlayOpacity: number;
  /** When false, the dashboard hero's overlaid title/subtitle are hidden. */
  homeHeroShowText: boolean;
  // Loading bar
  loadingBarStyle: 'solid' | 'gradient';
  loadingBarColors: string[];
}

export async function getAdminBranding(): Promise<AdminBrandingSettings | null> {
  const { supabase } = await requireAdmin();
  const configuration = await getInstallationConfig();
  const { data, error } = await supabase
    .from('tenant_settings')
    .select(`id, ${TENANT_SETTINGS_COLUMNS}`)
    .limit(1)
    .maybeSingle()
    .overrideTypes<Record<string, unknown>, { merge: false }>();
  if (error) throw new Error('brandingLoadFailed');
  const settings = resolveTenantSettings(configuration.branding, data);

  return {
    id: typeof data?.id === 'string' ? data.id : '',
    siteName: settings.site_name,
    logoUrl: settings.logo_url,
    logoLightUrl: settings.logo_light_url ?? settings.logo_url,
    logoDarkUrl: settings.logo_dark_url ?? settings.logo_url,
    faviconUrl: settings.favicon_url,
    ogImageUrl: settings.og_image_url,
    primaryColor: settings.primary_color,
    accentColor: settings.accent_color,
    secondaryColor: settings.secondary_color ?? '',
    fontFamily: settings.font_family,
    homeHeroBannerUrl: settings.home_hero_banner_url,
    homeHeroTrailerYoutubeId: settings.home_hero_trailer_youtube_id,
    homeHeroTitle: settings.home_hero_title,
    homeHeroSubtitle: settings.home_hero_subtitle,
    homeHeroOverlayOpacity: settings.home_hero_overlay_opacity,
    homeHeroShowText: settings.home_hero_show_text,
    loadingBarStyle: settings.loading_bar_style,
    loadingBarColors: settings.loading_bar_colors,
  };
}

export interface SaveAdminBrandingInput {
  siteName: string;
  // Identity
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  faviconUrl?: string | null;
  ogImageUrl?: string | null;
  // Colors
  primaryColor: string;
  accentColor: string;
  secondaryColor?: string;
  fontFamily?: string;
  // Home hero
  homeHeroBannerUrl?: string | null;
  homeHeroTrailerYoutubeId?: string | null;
  homeHeroTitle?: string | null;
  homeHeroSubtitle?: string | null;
  homeHeroOverlayOpacity?: number;
  homeHeroShowText?: boolean;
  loadingBarStyle?: 'solid' | 'gradient';
  loadingBarColors?: string[];
}

export async function saveAdminBranding(settings: SaveAdminBrandingInput) {
  const { supabase } = await requireAdmin();
  const parsed = parseAdminBranding(settings);
  if ('error' in parsed) return { error: 'invalidInput' } as const;
  const payload = parsed.data;

  const { data: existing, error: lookupError } = await supabase
    .from('tenant_settings')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (lookupError) return { error: 'saveFailed' } as const;

  if (existing) {
    const { data: saved, error } = await supabase
      .from('tenant_settings')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .maybeSingle();
    if (error) return { error: 'saveFailed' } as const;
    if (!saved) return { error: 'notFound' } as const;
  } else {
    const { data: saved, error } = await supabase
      .from('tenant_settings')
      .insert(payload)
      .select('id')
      .single();
    if (error || !saved) return { error: 'saveFailed' } as const;
  }

  // Refresh root layout so injected theme vars, favicon, and logo update.
  revalidatePath('/', 'layout');
  return { success: true };
}

// ─── User management ────────────────────────────────────────────────────────

export async function updateUserRole(targetId: string, newRole: UserRole): Promise<void> {
  const { supabase, callerRole, callerId } = await requireAdmin();

  if (!['user', 'admin', 'super_admin'].includes(newRole)) throw new Error('Invalid role');
  if (callerRole !== 'super_admin') {
    throw new Error('Only super_admin can grant elevated roles');
  }
  if (targetId === callerId) throw new Error('Cannot change your own role');

  const { data: savedProfile, error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', targetId).select('id').maybeSingle();

  if (error || !savedProfile) throw new Error('roleFailed');
}

/**
 * Edit a user's core profile from the admin panel: name, email, country,
 * and phone. Email lives only in Supabase Auth (auth.users), so it can't
 * be a plain profiles UPDATE — it goes through the Auth admin API with
 * `email_confirm: true` so the change is immediate (no re-confirmation),
 * since the admin is acting on the customer's behalf.
 *
 * Only the fields that actually changed are written, so re-saving an
 * unchanged form never triggers a spurious email rotation. Returns a
 * friendly error (never throws) so the dialog can surface it inline.
 */
export interface UpdateUserProfileInput {
  userId: string;
  displayName: string;
  email: string;
  country: string | null;
  phone: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateUserProfile(
  input: UpdateUserProfileInput,
): Promise<{ success: true } | { error: string }> {
  const { adminClient } = await requireManageableUser(input.userId);

  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const country = input.country?.trim() || null;
  const phone = input.phone?.trim() || null;

  if (!displayName) return { error: 'nameRequired' };
  if (!email) return { error: 'emailRequired' };
  if (!EMAIL_RE.test(email)) return { error: 'invalidEmail' };

  // Read the current auth record so we only touch what actually changed.
  const { data: userRes, error: lookupErr } =
    await adminClient.auth.admin.getUserById(input.userId);
  if (lookupErr || !userRes?.user) {
    return { error: 'profileFailed' };
  }
  const currentEmail = (userRes.user.email ?? '').toLowerCase();
  const currentName =
    (userRes.user.user_metadata?.display_name as string | undefined) ?? '';

  // 1. Email — Auth admin API only, and only when it changed.
  if (email !== currentEmail) {
    const { error: emailErr } = await adminClient.auth.admin.updateUserById(
      input.userId,
      { email, email_confirm: true },
    );
    if (emailErr) {
      // Most common failure: the address already belongs to another user.
      return { error: emailErr.code === 'email_exists' ? 'emailExists' : 'profileFailed' };
    }
  }

  // 2. Name — keep Auth user_metadata in sync with profiles so email
  //    templates (which read metadata) and the app UI agree on the name.
  if (displayName !== currentName) {
    const { error: metaErr } = await adminClient.auth.admin.updateUserById(
      input.userId,
      {
        user_metadata: {
          ...userRes.user.user_metadata,
          display_name: displayName,
          full_name: displayName,
        },
      },
    );
    if (metaErr) return { error: 'profileFailed' };
  }

  // 3. Profile columns (name / country / phone) — source of truth for the UI.
  const { data: savedProfile, error: profileErr } = await adminClient
    .from('profiles')
    .update({ display_name: displayName, country, phone })
    .eq('id', input.userId).select('id').maybeSingle();
  if (profileErr || !savedProfile) return { error: 'profileFailed' };

  revalidatePath(`/admin/users/${input.userId}`);
  revalidatePath('/admin/users');
  return { success: true };
}

export async function suspendUser(targetId: string): Promise<void> {
  const { supabase, adminClient, callerId } = await requireManageableUser(targetId);
  if (targetId === callerId) throw new Error('Cannot suspend yourself');

  const { data: savedProfile, error: profileError } = await supabase.from('profiles').update({ status: 'suspended' }).eq('id', targetId).select('id').maybeSingle();
  if (profileError || !savedProfile) throw new Error('suspendFailed');
  const { error } = await adminClient.auth.admin.updateUserById(targetId, { ban_duration: '876000h' });
  if (error) throw new Error('suspendFailed');
}

export async function restoreUser(targetId: string): Promise<void> {
  const { supabase, adminClient } = await requireManageableUser(targetId);

  const { error } = await adminClient.auth.admin.updateUserById(targetId, { ban_duration: 'none' });
  if (error) throw new Error('restoreFailed');
  const { data: savedProfile, error: profileError } = await supabase.from('profiles').update({ status: 'active' }).eq('id', targetId).select('id').maybeSingle();
  if (profileError || !savedProfile) throw new Error('restoreFailed');
}

export async function deleteUser(targetId: string): Promise<void> {
  const { adminClient, callerId } = await requireManageableUser(targetId);
  if (targetId === callerId) throw new Error('Cannot delete yourself');

  const { error } = await adminClient.auth.admin.deleteUser(targetId);
  if (error) throw new Error('deleteFailed');
}

// ─── Password reset (admin-initiated) ───────────────────────────────────────

/**
 * Sends Supabase's standard recovery email to the target user. The email
 * contains a one-time magic link that lands on /reset-password, letting
 * the user pick their own new password. Nothing is shown back to the
 * admin — the secret stays between Supabase and the user's inbox.
 */
export async function adminSendPasswordResetEmail(
  targetId: string,
): Promise<{ success: true } | { error: string }> {
  const { adminClient } = await requireManageableUser(targetId);

  const { data: userRes, error: lookupErr } =
    await adminClient.auth.admin.getUserById(targetId);
  if (lookupErr || !userRes?.user?.email) {
    return { error: 'recoveryFailed' };
  }

  // Use a fresh anon (browser-shaped) client with no session attached.
  // resetPasswordForEmail is an unauthenticated endpoint; the server-
  // cookie-scoped client and the service-role client both trip over
  // session plumbing ("Auth session missing!") on some SDK paths.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const anon = createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: createSupabaseServerFetch() },
    },
  );
  // Route through /api/auth/callback so the recovery code is exchanged
  // for a session before /reset-password renders. Without this, the form
  // submits with no session and updateUser() returns "Not signed in"
  // silently. Mirrors features/Auth/actions.ts::requestPasswordReset.
  const { error } = await anon.auth.resetPasswordForEmail(userRes.user.email, {
    redirectTo: `${siteUrl}/api/auth/callback?next=/reset-password`,
  });
  if (error) {
    console.error('[admin] resetPasswordForEmail failed:', error);
    return { error: 'recoveryFailed' };
  }
  return { success: true };
}

/**
 * Emails the user a one-time magic login link — clicking it signs them in
 * directly (no password) via /api/auth/callback, which already handles
 * type=magiclink. For students who can't manage the normal login flow.
 */
export async function adminSendMagicLink(
  targetId: string,
): Promise<{ success: true } | { error: string }> {
  const { adminClient } = await requireManageableUser(targetId);

  const { data: userRes, error: lookupErr } =
    await adminClient.auth.admin.getUserById(targetId);
  if (lookupErr || !userRes?.user?.email) {
    return { error: 'magicLinkFailed' };
  }

  // A magic link is full account access — never issue one for a
  // suspended account.
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('status')
    .eq('id', targetId)
    .single();
  if (profileError || !profile) return { error: 'magicLinkFailed' };
  if (profile.status === 'suspended') {
    return { error: 'accountSuspended' };
  }

  // Same anon-client shape as adminSendPasswordResetEmail — see the
  // session-plumbing note there.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const anon = createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: createSupabaseServerFetch() },
    },
  );
  const { error } = await anon.auth.signInWithOtp({
    email: userRes.user.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl}/api/auth/callback?next=/dashboard`,
    },
  });
  if (error) {
    console.error('[admin] signInWithOtp (magic link) failed:', error);
    return { error: 'magicLinkFailed' };
  }
  return { success: true };
}

/**
 * Generates a one-time magic login link WITHOUT sending any email, so the
 * admin can copy it and hand it to the student over WhatsApp etc. Same
 * guarantees as adminSendMagicLink: admin-only, suspended accounts refused,
 * single-use, expires per the project's OTP window.
 */
export async function adminGenerateMagicLink(
  targetId: string,
): Promise<{ link: string } | { error: string }> {
  const { adminClient } = await requireManageableUser(targetId);

  const { data: userRes, error: lookupErr } =
    await adminClient.auth.admin.getUserById(targetId);
  if (lookupErr || !userRes?.user?.email) {
    return { error: 'magicLinkFailed' };
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('status')
    .eq('id', targetId)
    .single();
  if (profileError || !profile) return { error: 'magicLinkFailed' };
  if (profile.status === 'suspended') {
    return { error: 'accountSuspended' };
  }

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: userRes.user.email,
  });
  if (error || !data?.properties?.hashed_token) {
    console.error('[admin] generateLink (magic link) failed:', error);
    return { error: 'magicLinkFailed' };
  }

  // Build the link on our own domain instead of handing out the raw
  // Supabase verify URL — same callback the emailed links go through.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const link = `${siteUrl}/api/auth/callback?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=magiclink&next=/dashboard`;
  return { link };
}

/**
 * Resets the user's password to a freshly-generated temporary value and
 * flips must_change_password so the (main)/layout.tsx guard forces them
 * through /change-password on next sign-in. Returns the password to the
 * admin exactly once — it is never persisted anywhere readable.
 *
 * Use this path when the user can't receive email (wrong address on
 * file, provider bounced, etc.) and the admin needs to hand them
 * credentials out-of-band.
 */
export async function adminSetTemporaryPassword(
  targetId: string,
): Promise<{ password: string } | { error: string }> {
  const { adminClient, supabase } = await requireManageableUser(targetId);

  const tempPassword = generateTempPassword();

  const { error: authErr } = await adminClient.auth.admin.updateUserById(
    targetId,
    { password: tempPassword },
  );
  if (authErr) return { error: 'passwordFailed' };

  const { data: savedProfile, error: profileErr } = await supabase
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', targetId).select('id').maybeSingle();
  if (profileErr || !savedProfile) return { error: 'passwordFailed' };

  return { password: tempPassword };
}

// ─── User enrollments (for inline management) ──────────────────────────────

export interface UserEnrollmentCohort {
  courseId: string;
  courseName: string;
  cohortId: string;
  cohortName: string;
}

export interface UserEnrollment {
  id: string;
  accessLevelId: string;
  accessLevelName: string;
  source: string;
  enrolledAt: string;
  expiresAt: string | null;
  isActive: boolean;
  /** True when expires_at is set and in the past. */
  isExpired: boolean;
  /** Turma assignments — one per course the access_level grants, when assigned. */
  cohorts: UserEnrollmentCohort[];
}

export async function getUserEnrollments(userId: string): Promise<UserEnrollment[]> {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      id, access_level_id, source, enrolled_at, expires_at, is_active,
      access_levels ( name )
    `)
    .eq('user_id', userId)
    .order('enrolled_at', { ascending: false });

  if (error) throw new Error('loadFailed');
  const enrollments = data ?? [];
  if (enrollments.length === 0) return [];

  // Load cohort assignments for each enrollment via the join table.
  const enrollmentIds = enrollments.map((e) => e.id);
  const { data: joinRows, error: joinError } = await supabase
    .from('enrollment_cohorts')
    .select(`
      enrollment_id, course_id, cohort_id,
      cohorts ( name ),
      courses ( title )
    `)
    .in('enrollment_id', enrollmentIds);

  if (joinError) throw new Error('loadFailed');
  const cohortsByEnrollment = new Map<string, UserEnrollmentCohort[]>();
  for (const row of joinRows ?? []) {
    const list = cohortsByEnrollment.get(row.enrollment_id) ?? [];
    list.push({
      courseId: row.course_id,
      courseName: (row.courses as unknown as { title: string } | null)?.title ?? '',
      cohortId: row.cohort_id,
      cohortName: (row.cohorts as unknown as { name: string } | null)?.name ?? '',
    });
    cohortsByEnrollment.set(row.enrollment_id, list);
  }

  const now = Date.now();
  return enrollments.map((e) => ({
    id: e.id,
    accessLevelId: e.access_level_id,
    accessLevelName: (e.access_levels as unknown as { name: string } | null)?.name ?? '',
    source: e.source,
    enrolledAt: e.enrolled_at,
    expiresAt: e.expires_at,
    isActive: e.is_active,
    isExpired: e.expires_at ? new Date(e.expires_at).getTime() < now : false,
    cohorts: cohortsByEnrollment.get(e.id) ?? [],
  }));
}

// ─── Email sender config (tenant_settings) ────────────────────────────────

export interface AdminEmailSenderConfig {
  fromAddress: string | null;
  fromName: string | null;
  replyTo: string | null;
  /** Destination for "new support ticket" admin notifications. */
  supportInbox: string | null;
  /** Only transport status reaches the browser; credentials stay server-side. */
  transport: 'resend' | 'mailpit' | null;
}

export async function getEmailSenderConfig(): Promise<AdminEmailSenderConfig> {
  await requireAdmin();
  const settings = await getTenantSettings();
  return {
    fromAddress: settings.email_from_address,
    fromName: settings.email_from_name,
    replyTo: settings.email_reply_to,
    supportInbox: settings.support_inbox_email,
    transport: getEmailTransport()?.provider ?? null,
  };
}

export async function saveEmailSenderConfig(input: {
  fromAddress: string;
  fromName: string;
  replyTo?: string;
  supportInbox?: string;
}) {
  const { supabase } = await requireAdmin();

  const fromAddress = input.fromAddress.trim();
  const fromName = input.fromName.trim();
  const replyTo = input.replyTo?.trim() || null;
  const supportInbox = input.supportInbox?.trim() || null;
  if (!fromName || !EMAIL_RE.test(fromAddress)) return { error: 'invalidInput' };
  if ((replyTo && !EMAIL_RE.test(replyTo)) || (supportInbox && !EMAIL_RE.test(supportInbox))) {
    return { error: 'invalidEmail' };
  }

  const payload = {
    email_from_address: fromAddress,
    email_from_name: fromName,
    email_reply_to: replyTo,
    support_inbox_email: supportInbox,
  };

  const { data: existing, error: readError } = await supabase
    .from('tenant_settings')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (readError) return { error: 'operationFailed' };

  if (existing) {
    const { data: updated, error } = await supabase
      .from('tenant_settings')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .maybeSingle();
    if (error || !updated) return { error: error ? 'operationFailed' : 'notFound' };
  } else {
    const { data: created, error } = await supabase
      .from('tenant_settings')
      .insert(payload)
      .select('id')
      .single();
    if (error || !created) return { error: 'operationFailed' };
  }

  revalidatePath('/admin/emails');
  return { success: true };
}

/**
 * Sends a non-persistent preview of the welcome-with-password template to
 * the caller's chosen address, so the admin can verify Brevo config + copy
 * before going live. Uses fake credentials so no real secret leaks.
 */
export async function sendTestEmail(toEmail: string) {
  const { callerId } = await requireAdmin();

  const trimmed = toEmail.trim();
  if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return { error: 'invalidEmail' };
  }

  try {
    const requestedLocale = await getLocale();
    const { locale, source: localeSource } = await resolveRecipientLocale(
      callerId,
      requestedLocale,
    );
    const now = new Date();
    const frame = getEmailFrameContent(locale);
    const settings = await getTenantSettings();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const emailBranding = getEmailBranding(settings, siteUrl);

    const content = await loadLocalizedTemplateContent(
      TEMPLATE_KEYS.WELCOME_WITH_PASSWORD,
      locale,
    );
    const { subject, html, text } = await renderWelcomeWithPassword(
      {
        studentName: frame.sampleStudentName,
        studentEmail: trimmed,
        temporaryPassword: 'TestPass123',
        loginUrl: `${siteUrl}/login`,
        courseTitle: frame.sampleCourseTitle,
        locale,
        now,
        ...emailBranding,
      },
      content,
    );

    const result = await sendTransactional({
      userId: callerId,
      to: { email: trimmed, name: frame.sampleStudentName },
      templateKey: TEMPLATE_KEYS.WELCOME_WITH_PASSWORD,
      subject: `${frame.testSubjectPrefix} ${subject}`,
      html,
      text,
      tags: ['test-email'],
      metadata: {
        test: true,
        sentBy: callerId,
        locale,
        localeSource,
      },
    });

    if (!result.success) return { error: 'sendFailed' };
    return { success: true, messageId: result.messageId };
  } catch {
    return { error: 'sendFailed' };
  }
}

// ─── Email templates (admin-editable content) ─────────────────────────────

export async function getEmailTemplates(): Promise<AdminEmailTemplate[]> {
  await requireAdmin();
  const requestedLocale = await getLocale();
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;

  const out: AdminEmailTemplate[] = [];
  for (const entry of ADMIN_EMAIL_TEMPLATE_CATALOG) {
    const { content, hasOverride, overrideFields } = await loadTemplateContentForAdmin(
      entry.key,
      getEmailTemplateDefaults(entry.key, locale) as unknown as Record<string, string>,
    );
    out.push({
      key: entry.key,
      displayName: entry.displayName,
      description: entry.description,
      varKeys: entry.varKeys,
      fields: entry.fields,
      content,
      overrideFields,
      isDefault: !hasOverride,
    });
  }
  return out;
}

export async function saveEmailTemplate(
  templateKey: TemplateKey,
  content: Record<string, string>,
) {
  await requireAdmin();
  const entry = ADMIN_EMAIL_TEMPLATE_CATALOG.find((t) => t.key === templateKey);
  if (!entry) return { error: 'unknownTemplate' };

  // Whitelist keys: never persist stray fields the admin might sneak in
  const safeContent: Record<string, string> = {};
  for (const field of entry.fields) {
    const value = content[field.key];
    if (typeof value === 'string') safeContent[field.key] = value;
  }

  const result = await saveTemplateContent(templateKey, safeContent);
  if (result.error) return { error: result.error };

  revalidatePath('/admin/emails');
  return { success: true };
}

export async function resetEmailTemplate(templateKey: TemplateKey) {
  await requireAdmin();
  if (!ADMIN_EMAIL_TEMPLATE_CATALOG.some((template) => template.key === templateKey)) {
    return { error: 'unknownTemplate' };
  }
  const result = await resetTemplateContent(templateKey);
  if (result.error) return { error: result.error };

  revalidatePath('/admin/emails');
  return { success: true };
}

/**
 * Renders a template with sample vars and the admin's (possibly unsaved)
 * content. Returns HTML for the preview iframe plus the resolved subject.
 */
export async function previewEmailTemplate(
  templateKey: TemplateKey,
  content: Record<string, string>,
): Promise<{ subject: string; html: string } | { error: string }> {
  await requireAdmin();

  try {
    const requestedLocale = await getLocale();
    const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;
    const now = new Date();
    const frame = getEmailFrameContent(locale);
    const settings = await getTenantSettings();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const emailBranding = getEmailBranding(settings, siteUrl);

    if (templateKey === TEMPLATE_KEYS.WELCOME_WITH_PASSWORD) {
      const { subject, html } = await renderWelcomeWithPassword(
        {
          studentName: frame.sampleStudentName,
          studentEmail: 'maria@example.com',
          temporaryPassword: 'TestPass123',
          loginUrl: `${siteUrl}/login`,
          courseTitle: frame.sampleCourseTitle,
          locale,
          now,
          ...emailBranding,
        },
        content as unknown as WelcomeWithPasswordContent,
      );
      return { subject, html };
    }

    if (templateKey === TEMPLATE_KEYS.PURCHASE_CONFIRMED) {
      const { subject, html } = await renderPurchaseConfirmed(
        {
          studentName: frame.sampleStudentName,
          courseTitle: frame.sampleCourseTitle,
          courseUrl: `${siteUrl}/courses/sample-course`,
          locale,
          now,
          ...emailBranding,
        },
        content as unknown as PurchaseConfirmedContent,
      );
      return { subject, html };
    }

    if (templateKey === TEMPLATE_KEYS.EXPIRATION_WARNING_7D) {
      const sevenDaysOut = new Date(now.getTime() + 7 * 86_400_000).toISOString();
      const { subject, html } = await renderExpirationWarning(
        {
          studentName: frame.sampleStudentName,
          courseTitle: frame.sampleCourseTitle,
          expiresAt: sevenDaysOut,
          renewUrl: `${siteUrl}/courses/sample-course`,
          locale,
          now,
          ...emailBranding,
        },
        content as unknown as ExpirationWarningContent,
      );
      return { subject, html };
    }

    if (templateKey === TEMPLATE_KEYS.MEMBERSHIP_WELCOME) {
      const membershipLinks = resolveMembershipEmailLinks((await getInstallationConfig()).links, siteUrl);
      const { subject, html } = await renderMembershipWelcome(
        {
          studentName: frame.sampleStudentName,
          studentEmail: 'maria@example.com',
          temporaryPassword: 'TestPass123',
          loginUrl: `${siteUrl}/login`,
          locale,
          now,
          ...membershipLinks,
          ...emailBranding,
        },
        content as unknown as MembershipWelcomeContent,
      );
      return { subject, html };
    }

    return { error: 'unknownTemplate' };
  } catch {
    return { error: 'renderFailed' };
  }
}

/**
 * Sends a test with the admin's current (possibly unsaved) content, so they
 * can verify copy changes before clicking save.
 */
export async function sendTemplateTestEmail(
  templateKey: TemplateKey,
  content: Record<string, string>,
  toEmail: string,
) {
  const { callerId } = await requireAdmin();

  const trimmed = toEmail.trim();
  if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return { error: 'invalidEmail' };
  }

  try {
    const requestedLocale = await getLocale();
    const { locale, source: localeSource } = await resolveRecipientLocale(
      callerId,
      requestedLocale,
    );
    const now = new Date();
    const frame = getEmailFrameContent(locale);
    const settings = await getTenantSettings();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const emailBranding = getEmailBranding(settings, siteUrl);
    let rendered: { subject: string; html: string; text: string };

    if (templateKey === TEMPLATE_KEYS.WELCOME_WITH_PASSWORD) {
      rendered = await renderWelcomeWithPassword(
        {
          studentName: frame.sampleStudentName,
          studentEmail: trimmed,
          temporaryPassword: 'TestPass123',
          loginUrl: `${siteUrl}/login`,
          courseTitle: frame.sampleCourseTitle,
          locale,
          now,
          ...emailBranding,
        },
        content as unknown as WelcomeWithPasswordContent,
      );
    } else if (templateKey === TEMPLATE_KEYS.PURCHASE_CONFIRMED) {
      rendered = await renderPurchaseConfirmed(
        {
          studentName: frame.sampleStudentName,
          courseTitle: frame.sampleCourseTitle,
          courseUrl: `${siteUrl}/courses/sample-course`,
          locale,
          now,
          ...emailBranding,
        },
        content as unknown as PurchaseConfirmedContent,
      );
    } else if (templateKey === TEMPLATE_KEYS.EXPIRATION_WARNING_7D) {
      const sevenDaysOut = new Date(now.getTime() + 7 * 86_400_000).toISOString();
      rendered = await renderExpirationWarning(
        {
          studentName: frame.sampleStudentName,
          courseTitle: frame.sampleCourseTitle,
          expiresAt: sevenDaysOut,
          renewUrl: `${siteUrl}/courses/sample-course`,
          locale,
          now,
          ...emailBranding,
        },
        content as unknown as ExpirationWarningContent,
      );
    } else if (templateKey === TEMPLATE_KEYS.MEMBERSHIP_WELCOME) {
      const membershipLinks = resolveMembershipEmailLinks(
        (await getInstallationConfig()).links,
        siteUrl,
      );
      rendered = await renderMembershipWelcome(
        {
          studentName: frame.sampleStudentName,
          studentEmail: trimmed,
          temporaryPassword: 'TestPass123',
          loginUrl: `${siteUrl}/login`,
          locale,
          now,
          ...membershipLinks,
          ...emailBranding,
        },
        content as unknown as MembershipWelcomeContent,
      );
    } else {
      return { error: 'unknownTemplate' };
    }

    const result = await sendTransactional({
      userId: callerId,
      to: { email: trimmed },
      templateKey,
      subject: `${frame.testSubjectPrefix} ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
      tags: ['test-email'],
      metadata: {
        test: true,
        sentBy: callerId,
        locale,
        localeSource,
      },
    });

    if (!result.success) return { error: 'sendFailed' };
    return { success: true, messageId: result.messageId };
  } catch {
    return { error: 'renderFailed' };
  }
}

// ─── Reorder courses (drag-and-drop in admin content) ───────────────────────

export async function reorderCourses(orderedIds: string[]) {
  const { supabase } = await requireAdmin();
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { error: 'invalidInput' };
  }

  const updates = orderedIds.map((id, index) =>
    supabase
      .from('courses')
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle(),
  );
  const results = await Promise.all(updates);
  if (results.some((result) => result.error)) {
    return { error: 'operationFailed' };
  }
  if (results.some((result) => !result.data)) return { error: 'notFound' };

  revalidatePath('/admin/content');
  revalidatePath('/courses');
  revalidatePath('/dashboard');
  return { success: true };
}

// ─── Custom menu items (user dropdown entries) ──────────────────────────────

const ICON_SET = new Set<string>(MENU_ICON_NAMES);

type AdminCustomMenuItem = CustomMenuItem;

type CustomMenuItemInput = {
  label: string;
  url: string;
  iconName: MenuIconName | null;
  isEnabled: boolean;
};

/**
 * Invalidates every page that mounts the main layout so the user
 * dropdown (rendered in TopNav) picks up the change everywhere.
 */
function revalidateMenuSurfaces() {
  revalidatePath('/', 'layout');
}

export async function listCustomMenuItems(): Promise<AdminCustomMenuItem[]> {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from('custom_menu_items')
    .select('id, label, url, icon_name, sort_order, is_enabled')
    .order('sort_order', { ascending: true });

  if (error || !data) throw new Error('menuLoadFailed');

  return data.map((row) => ({
    id: row.id,
    label: row.label,
    url: row.url,
    iconName: ICON_SET.has(row.icon_name ?? '') ? (row.icon_name as MenuIconName) : null,
    sortOrder: row.sort_order,
    isEnabled: row.is_enabled,
  }));
}

export async function createCustomMenuItem(input: CustomMenuItemInput) {
  const { supabase } = await requireAdmin();
  const v = validateCustomMenuInput(input);
  if ('error' in v) return v;

  // Place new items at the end by default.
  const { data: tail, error: tailError } = await supabase
    .from('custom_menu_items')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tailError) return { error: 'saveFailed' } as const;
  const nextOrder = (tail?.sort_order ?? -1) + 1;

  const { data: saved, error } = await supabase
    .from('custom_menu_items')
    .insert({
      label: v.label,
      url: v.url,
      icon_name: input.iconName,
      sort_order: nextOrder,
      is_enabled: input.isEnabled,
    })
    .select('id')
    .single();
  if (error || !saved) return { error: 'saveFailed' } as const;

  revalidateMenuSurfaces();
  return { success: true };
}

export async function updateCustomMenuItem(id: string, input: CustomMenuItemInput) {
  const { supabase } = await requireAdmin();
  const v = validateCustomMenuInput(input);
  if ('error' in v) return v;

  const { data: saved, error } = await supabase
    .from('custom_menu_items')
    .update({
      label: v.label,
      url: v.url,
      icon_name: input.iconName,
      is_enabled: input.isEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'saveFailed' } as const;
  if (!saved) return { error: 'notFound' } as const;

  revalidateMenuSurfaces();
  return { success: true };
}

export async function deleteCustomMenuItem(id: string) {
  const { supabase } = await requireAdmin();

  const { data: deleted, error } = await supabase
    .from('custom_menu_items')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'deleteFailed' } as const;
  if (!deleted) return { error: 'notFound' } as const;

  revalidateMenuSurfaces();
  return { success: true };
}

export async function reorderCustomMenuItems(orderedIds: string[]) {
  const { supabase } = await requireAdmin();

  const updates = orderedIds.map((id, index) =>
    supabase
      .from('custom_menu_items')
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle(),
  );
  const results = await Promise.all(updates);
  if (results.some((result) => result.error)) {
    return { error: 'saveFailed' } as const;
  }
  if (results.some((result) => !result.data)) {
    return { error: 'notFound' } as const;
  }

  revalidateMenuSurfaces();
  return { success: true };
}

// ─── Manual "Add student" ───────────────────────────────────────────────────

/**
 * Invite a new student (or grant a new enrollment to an existing one).
 *
 * - New email + sendWelcomeEmail: creates the auth user with a generated
 *   temporary password and ships the welcome-with-password email (same
 *   flow as webhook-driven purchases). The user logs in normally at
 *   /login with the temp password and must change it before continuing.
 * - New email + no welcome: creates the user with no password — admin
 *   shares credentials out-of-band or the user resets via
 *   "Forgot password".
 * - Existing email: skips user creation and just upserts the enrollment.
 *   No password email (they already have one), only an in-app
 *   notification when the enrollment is brand new.
 *
 * The on_auth_user_created trigger materialises the profile row.
 */
export async function inviteStudentManually(input: {
  email: string;
  name: string;
  accessLevelId: string;
  expiresAt: string | null;
  cohortId: string | null;
  sendWelcomeEmail: boolean;
}): Promise<
  | { success: true; userId: string; userExisted: boolean; invited: boolean }
  | { error: string }
> {
  const { adminClient } = await requireAdmin();

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !name) return { error: 'nameAndEmailRequired' };
  if (!isEmailShape(email)) return { error: 'invalidEmail' };
  if (!input.accessLevelId) return { error: 'accessLevelRequired' };

  // Look up the exact account without depending on Auth list pagination.
  const { data: existingId, error: lookupError } = await adminClient.rpc('get_user_id_by_email', {
    p_email: email,
  });
  if (lookupError) return { error: 'invitationFailed' };

  let userId: string;
  let userExisted = false;
  let invited = false;
  let tempPassword: string | null = null;

  if (existingId) {
    userId = existingId;
    userExisted = true;
  } else {
    // Always createUser with email_confirm so the user can log in
    // immediately. When sending the welcome email we set a temporary
    // password and ship it in the body (same flow used by the webhook
    // processor for first-time buyers). Without sendWelcomeEmail the
    // user is created without a password — admin shares creds out-of-band
    // or the user resets via "Forgot password".
    if (input.sendWelcomeEmail) {
      tempPassword = generateTempPassword();
    }
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      ...(tempPassword ? { password: tempPassword } : {}),
      email_confirm: true,
      user_metadata: { display_name: name, full_name: name },
    });
    if (error || !data?.user) {
      return { error: 'invitationFailed' };
    }
    userId = data.user.id;

    // The on_auth_user_created trigger materialises the profiles row, but
    // display_name can come out empty depending on the trigger shape —
    // this extra write guarantees the name we were given is stored.
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .update({ display_name: name, ...(tempPassword ? { must_change_password: true } : {}) })
      .eq('id', userId)
      .select('id')
      .maybeSingle();
    if (profileError || !profile) return { error: 'accountSetupFailed' };
  }

  // Enrollment and cohort assignment commit together; failure leaves prior access intact.
  const grant = await applyManualEnrollment(adminClient, {
    userId,
    accessLevelId: input.accessLevelId,
    source: 'manual_admin_add',
    expiresAt: input.expiresAt,
    cohortMode: input.cohortId ? 'merge' : 'preserve',
    cohorts: input.cohortId ? [{ cohortId: input.cohortId }] : [],
  });
  if ('error' in grant) return { error: 'invitationFailed' };

  // 4. Welcome flow. New users get the welcome-with-password email (so they
  // know their temporary credentials) + in-app notification. Existing users
  // only get the in-app notification when the enrollment is fresh — they
  // already have credentials and don't need a password reset.
  if (input.sendWelcomeEmail) {
    if (!userExisted && tempPassword) {
      try {
        const delivery = await sendEnrollmentEmail({
          userId,
          email,
          name,
          accessLevelId: input.accessLevelId,
          isNewUser: true,
          tempPassword,
        });
        invited = delivery.success;
      } catch (e) {
        console.error('[inviteStudentManually] sendEnrollmentEmail failed:', e);
      }
    }

    if (!userExisted || grant.created) {
      try {
        const { notifyEnrollment } = await import(
          '@/features/Enrollment/notifications'
        );
        await notifyEnrollment({ userId, accessLevelId: input.accessLevelId });
      } catch (e) {
        console.error('[inviteStudentManually] notifyEnrollment failed:', e);
      }
    }
  }

  revalidatePath('/admin/users');
  revalidatePath('/admin/enrollments');

  return { success: true, userId, userExisted, invited };
}

// ─── Bulk CSV import ────────────────────────────────────────────────────────

export interface ImportRow {
  email: string;
  name: string;
  access_level_slug: string;
  expiration_date?: string;
  cohort_slug?: string;
  send_welcome_email?: string;
}

export interface ImportRowPreview {
  rowIndex: number;
  email: string;
  name: string;
  accessLevelSlug: string;
  accessLevelName: string | null;
  expirationDate: string | null;
  cohortSlug: string | null;
  cohortName: string | null;
  userExists: boolean;
  status: 'valid' | 'existing' | 'error';
  reasonCode: ImportReasonCode | null;
  reasonValues?: ImportReasonValues;
  /** Parsed + resolved payload ready to feed the bulk importer. */
  resolved: {
    email: string;
    name: string;
    accessLevelId: string;
    cohortId: string | null;
    expiresAtIso: string | null;
  } | null;
}

export interface BulkImportSummary {
  totalRows: number;
  created: number;
  addedToExisting: number;
  skippedErrors: number;
  errors: Array<{
    rowIndex: number;
    email: string;
    reasonCode: ImportReasonCode;
    reasonValues?: ImportReasonValues;
  }>;
}

function isEmailShape(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function parseSendWelcome(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(v)) return true;
  if (['false', '0', 'no', 'n'].includes(v)) return false;
  return fallback;
}

async function getExistingImportEmails(
  adminClient: ReturnType<typeof createAdminClient>,
  rows: ImportRow[],
): Promise<Set<string>> {
  const emails = [...new Set(rows.map((row) => (row.email ?? '').trim().toLowerCase()).filter(isEmailShape))];
  const existing = new Set<string>();
  try {
    for (let index = 0; index < emails.length; index += 5) {
      await Promise.all(emails.slice(index, index + 5).map(async (email) => {
        const { data, error } = await adminClient.rpc('get_user_id_by_email', { p_email: email });
        if (error) throw new Error('importUnavailable');
        if (data) existing.add(email);
      }));
    }
  } catch {
    throw new Error('importUnavailable');
  }
  return existing;
}

/** Preflight without writes, using complete catalogues and exact account lookups. */
export async function previewBulkImport(
  rows: ImportRow[],
): Promise<ImportRowPreview[]> {
  const { adminClient } = await requireAdmin();

  const [levels, cohorts, alcRows, existingEmails] = await Promise.all([
    readAllRows((from, to) => adminClient.from('access_levels').select('id, slug, name', { count: 'exact' })
      .order('id').range(from, to), (row) => row.id),
    readAllRows((from, to) => adminClient.from('cohorts').select('id, slug, name, course_id', { count: 'exact' })
      .order('id').range(from, to), (row) => row.id),
    readAllRows((from, to) => adminClient.from('access_level_courses').select('access_level_id, course_id', { count: 'exact' })
      .order('access_level_id').order('course_id').range(from, to), (row) => `${row.access_level_id}:${row.course_id}`),
    getExistingImportEmails(adminClient, rows),
  ]).catch(() => { throw new Error('importUnavailable'); });

  const levelBySlug = new Map(
    levels.map((l) => [l.slug.trim().toLowerCase(), l]),
  );
  const cohortBySlug = new Map(
    cohorts.map((c) => [c.slug.trim().toLowerCase(), c]),
  );

  // Also cross-check that the cohort's course is granted by the level.
  const coursesByLevel = new Map<string, Set<string>>();
  for (const r of alcRows) {
    const set = coursesByLevel.get(r.access_level_id) ?? new Set<string>();
    set.add(r.course_id);
    coursesByLevel.set(r.access_level_id, set);
  }

  const previews: ImportRowPreview[] = [];

  rows.forEach((row, idx) => {
    // +2 = 1-based + header line.
    const rowIndex = idx + 2;
    const email = (row.email ?? '').trim().toLowerCase();
    const name = (row.name ?? '').trim();
    const accessLevelSlug = (row.access_level_slug ?? '').trim().toLowerCase();
    const cohortSlug = (row.cohort_slug ?? '').trim().toLowerCase();
    const expirationDateRaw = (row.expiration_date ?? '').trim();

    const mk = (
      status: ImportRowPreview['status'],
      reasonCode: ImportReasonCode | null,
      reasonValues?: ImportReasonValues,
      resolved: ImportRowPreview['resolved'] = null,
    ): ImportRowPreview => ({
      rowIndex,
      email,
      name,
      accessLevelSlug,
      accessLevelName:
        levelBySlug.get(accessLevelSlug)?.name ??
        (accessLevelSlug ? accessLevelSlug : null),
      expirationDate: expirationDateRaw || null,
      cohortSlug: cohortSlug || null,
      cohortName:
        cohortSlug && cohortBySlug.has(cohortSlug)
          ? (cohortBySlug.get(cohortSlug)!.name as string)
          : cohortSlug || null,
      userExists: existingEmails.has(email),
      status,
      reasonCode,
      reasonValues,
      resolved,
    });

    if (!email) return previews.push(mk('error', 'emailRequired'));
    if (!isEmailShape(email))
      return previews.push(mk('error', 'invalidEmail'));
    if (!name) return previews.push(mk('error', 'nameRequired'));
    if (!accessLevelSlug)
      return previews.push(mk('error', 'accessLevelRequired'));

    const level = levelBySlug.get(accessLevelSlug);
    if (!level)
      return previews.push(
        mk('error', 'unknownAccessLevel', { slug: accessLevelSlug }),
      );

    let expiresAtIso: string | null = null;
    if (expirationDateRaw) {
      const d = new Date(expirationDateRaw);
      if (isNaN(d.getTime()))
        return previews.push(
          mk('error', 'invalidExpiration'),
        );
      expiresAtIso = d.toISOString();
    }

    let cohortId: string | null = null;
    if (cohortSlug) {
      const c = cohortBySlug.get(cohortSlug);
      if (!c)
        return previews.push(
          mk('error', 'unknownCohort', { slug: cohortSlug }),
        );
      const granted = coursesByLevel.get(level.id);
      if (!granted || !granted.has(c.course_id))
        return previews.push(
          mk(
            'error',
            'cohortNotGranted',
            { cohort: c.slug, level: level.slug },
          ),
        );
      cohortId = c.id;
    }

    const existsAlready = existingEmails.has(email);
    previews.push(
      mk(existsAlready ? 'existing' : 'valid', null, undefined, {
        email,
        name,
        accessLevelId: level.id,
        cohortId,
        expiresAtIso,
      }),
    );
  });

  return previews;
}

/**
 * Process rows sequentially, skipping error rows. Reuses the manual
 * invite helper — one exact account lookup per row keeps the email
 * branching, profile sync and cohort validation in a single code path.
 */
export async function bulkImportStudents(
  rows: ImportRow[],
  options: { defaultSendWelcomeEmail: boolean },
): Promise<BulkImportSummary> {
  await requireAdmin();
  const previews = await previewBulkImport(rows);

  const summary: BulkImportSummary = {
    totalRows: previews.length,
    created: 0,
    addedToExisting: 0,
    skippedErrors: 0,
    errors: [],
  };

  for (const p of previews) {
    if (p.status === 'error' || !p.resolved) {
      summary.skippedErrors += 1;
      summary.errors.push({
        rowIndex: p.rowIndex,
        email: p.email,
        reasonCode: p.reasonCode ?? 'operationFailed',
        reasonValues: p.reasonValues,
      });
      continue;
    }

    const sendWelcome = parseSendWelcome(
      rows[p.rowIndex - 2]?.send_welcome_email,
      options.defaultSendWelcomeEmail,
    );

    const result = await inviteStudentManually({
      email: p.resolved.email,
      name: p.resolved.name,
      accessLevelId: p.resolved.accessLevelId,
      expiresAt: p.resolved.expiresAtIso,
      cohortId: p.resolved.cohortId,
      sendWelcomeEmail: sendWelcome,
    });

    if ('error' in result) {
      summary.errors.push({
        rowIndex: p.rowIndex,
        email: p.email,
        reasonCode: isImportReasonCode(result.error)
          ? result.error
          : 'operationFailed',
      });
      summary.skippedErrors += 1;
    } else if (result.userExisted) {
      summary.addedToExisting += 1;
    } else {
      summary.created += 1;
    }
  }

  revalidatePath('/admin/users');
  revalidatePath('/admin/enrollments');
  return summary;
}

// ─── Scoring rules ──────────────────────────────────────────────────

// ─── Webhook test simulator ────────────────────────────────────────

export interface WebhookTestResult {
  ok: boolean;
  status: number;
  message: string;
  response?: unknown;
}

/**
 * Fires a signed synthetic payload at the given provider's webhook
 * endpoint with the X-Test-Mode: 1 header. The endpoint verifies the
 * signature (real logic, real secret) and short-circuits before any
 * DB write, so a successful response proves the admin's URL is
 * reachable and the signing secret is correct.
 */
export async function sendTestWebhookEvent(
  provider: string,
): Promise<WebhookTestResult> {
  await requireAdmin();
  if (!['stripe', 'guru', 'generic'].includes(provider)) {
    return { ok: false, status: 0, message: 'invalidProvider' };
  }
  const crypto = await import('crypto');
  const admin = createAdminClient();

  const { data: config, error: configError } = await admin
    .from('webhook_configs')
    .select('*')
    .eq('provider', provider)
    .eq('is_active', true)
    .maybeSingle();

  if (configError) {
    return { ok: false, status: 0, message: 'operationFailed' };
  }

  if (!config || !config.secret_key) {
    return {
      ok: false,
      status: 0,
      message: 'noActiveIntegration',
    };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
    'http://localhost:3000';

  let body: string;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'X-Test-Mode': '1',
  };
  let url: string;

  if (provider === 'stripe') {
    body = JSON.stringify({
      id: 'evt_test_simulator',
      object: 'event',
      type: 'test.ping',
      data: { object: { id: 'cs_test_simulator', __test: true } },
      created: Math.floor(Date.now() / 1000),
    });
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto
      .createHmac('sha256', config.secret_key)
      .update(`${t}.${body}`)
      .digest('hex');
    headers['stripe-signature'] = `t=${t},v1=${sig}`;
    url = `${siteUrl}/api/webhooks/stripe`;
  } else if (provider === 'guru') {
    // Auth is via URL-embedded token (secret_key). Include the configured
    // producer_id in the payload so the endpoint's payload-binding check
    // passes — otherwise a test would 401 on tenants that set one.
    const producerId = config.expected_producer_id as string | null;
    body = JSON.stringify({
      email: 'test@webhook.simulator.local',
      name: 'Webhook Simulator',
      transaction_id: 'test-simulator',
      status: 'approved',
      producer: producerId ? { id: producerId } : undefined,
      __test: true,
    });
    url = `${siteUrl}/api/webhooks/guru/${encodeURIComponent(config.secret_key)}`;
  } else if (provider === 'generic') {
    body = JSON.stringify({
      email: 'test@webhook.simulator.local',
      transaction_id: 'test-simulator',
      __test: true,
    });
    headers['Authorization'] = `Bearer ${config.secret_key}`;
    url = `${siteUrl}/api/webhooks/generic`;
  } else return { ok: false, status: 0, message: 'invalidProvider' };

  try {
    const res = await fetch(url, { method: 'POST', headers, body });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const ok = res.ok && json.testMode === true;
    return {
      ok,
      status: res.status,
      message: ok ? 'testSucceeded' : 'testFailed',
    };
  } catch {
    return {
      ok: false,
      status: 0,
      message: 'networkFailed',
    };
  }
}

const SCORING_TRIGGERS = [
  'lesson_completed',
  'rating_given',
  'enrollment_new',
  'chat_message',
] as const;

export async function updateScoringRule(
  trigger: (typeof SCORING_TRIGGERS)[number],
  points: number,
): Promise<{ success: true } | { error: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  if (!SCORING_TRIGGERS.includes(trigger)) {
    return { error: 'SCORING_TRIGGER_INVALID' };
  }
  const clamped = Math.max(0, Math.min(10000, Math.round(points)));
  const { data, error } = await admin
    .from('scoring_rules')
    .update({ points: clamped })
    .eq('trigger', trigger)
    .select('trigger')
    .maybeSingle();
  if (error || !data) return { error: 'SCORING_UPDATE_FAILED' };
  revalidatePath('/admin/reports');
  return { success: true };
}
