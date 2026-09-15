/**
 * GET /api/admin/users/export
 *
 * Returns the stable, machine-oriented CSV contract documented below. Labels,
 * role/status codes, ISO timestamps and authored display names stay literal.
 *
 * Columns:
 *   email, display_name, role, status, created_at, last_sign_in_at,
 *   email_confirmed_at, active_enrollments_count
 */
import { NextResponse } from 'next/server';
import { createClient as createSupabaseServer } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import { readAllRows } from '@/core/supabase/read-all';
import { readProfileAuthUsers } from '@/core/supabase/auth-export.server';
import { rateLimit } from '@/core/rate-limit';
import { csvCell } from '@/features/Admin/csv';

export const runtime = 'nodejs';

const EXPORT_LIMIT = { maxRequests: 10, windowMs: 60 * 60_000 };

type UsersExportApiError =
  | 'unauthenticated'
  | 'access_denied'
  | 'rate_limited'
  | 'users_export_failed';

function apiError(
  error: UsersExportApiError,
  status: number,
  headers?: Record<string, string>,
) {
  return NextResponse.json({ error }, { status, headers });
}

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return apiError('users_export_failed', 503);
    if (!user) return apiError('unauthenticated', 401);

    const { data: caller, error: callerError } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .maybeSingle();
    if (callerError) return apiError('users_export_failed', 503);
    if (
      caller?.status !== 'active' ||
      (caller.role !== 'admin' && caller.role !== 'super_admin')
    ) {
      return apiError('access_denied', 403);
    }

    const limit = rateLimit(`admin-users-export:${user.id}`, EXPORT_LIMIT);
    if (!limit.success) {
      return apiError('rate_limited', 429, { 'Retry-After': '3600' });
    }

    const admin = createAdminClient();
    const profiles = await readAllRows((from, to) => admin
      .from('profiles').select('id, display_name, role, status, created_at', { count: 'exact' })
      .order('created_at', { ascending: false }).order('id').range(from, to), profile => profile.id);
    const authUsers = await readProfileAuthUsers(admin.auth.admin, profiles.map(profile => profile.id));
    const enrollments = await readAllRows((from, to) => admin
      .from('enrollments').select('id, user_id', { count: 'exact' })
      .eq('is_active', true).order('id').range(from, to), enrollment => enrollment.id);

    const enrollmentCount = new Map<string, number>();
    for (const enrollment of enrollments) {
      enrollmentCount.set(
        enrollment.user_id,
        (enrollmentCount.get(enrollment.user_id) ?? 0) + 1,
      );
    }

    const header = [
      'email',
      'display_name',
      'role',
      'status',
      'created_at',
      'last_sign_in_at',
      'email_confirmed_at',
      'active_enrollments_count',
    ].join(',');

    const lines = [header];
    for (const profile of profiles) {
      const authUser = authUsers.get(profile.id)!;
      lines.push(
        [
          csvCell(authUser.email ?? ''),
          csvCell(profile.display_name),
          csvCell(profile.role),
          csvCell(profile.status),
          csvCell(profile.created_at),
          csvCell(authUser.last_sign_in_at ?? ''),
          csvCell(authUser.email_confirmed_at ?? ''),
          String(enrollmentCount.get(profile.id) ?? 0),
        ].join(','),
      );
    }

    const generatedAt = new Date();
    return new Response(`${lines.join('\n')}\n`, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="users-${generatedAt.toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return apiError('users_export_failed', 503);
  }
}
