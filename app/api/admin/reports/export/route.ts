/**
 * GET /api/admin/reports/export?period=...&from=...&to=...
 *
 * Bundles every Reports page section into one downloadable CSV. Product
 * framing follows the administrator profile locale; machine fields remain
 * stable for spreadsheet and programmatic consumers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServer } from '@/core/supabase/server';
import { resolveLocale } from '@/core/i18n/config';
import { negotiateLocale } from '@/core/i18n/negotiation';
import { rateLimit } from '@/core/rate-limit';
import { buildReportCsv } from '@/features/Admin/report-csv';
import {
  getReportsData,
  type ReportsPeriodKey,
} from '@/features/Admin/reports-queries';

export const runtime = 'nodejs';

const REPORT_EXPORT_LIMIT = { maxRequests: 20, windowMs: 60 * 60_000 };

type ReportExportApiError =
  | 'unauthenticated'
  | 'access_denied'
  | 'rate_limited'
  | 'report_export_failed';

function apiError(
  error: ReportExportApiError,
  status: number,
  headers?: Record<string, string>,
) {
  return NextResponse.json({ error }, { status, headers });
}

function parsePeriod(raw: string | null): ReportsPeriodKey {
  if (
    raw === '30d' ||
    raw === '90d' ||
    raw === 'month' ||
    raw === 'last_month' ||
    raw === 'custom'
  ) {
    return raw;
  }
  return '30d';
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return apiError('report_export_failed', 503);
    if (!user) return apiError('unauthenticated', 401);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, status, preferred_locale')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) return apiError('report_export_failed', 503);
    if (
      profile?.status !== 'active' ||
      (profile.role !== 'admin' && profile.role !== 'super_admin')
    ) {
      return apiError('access_denied', 403);
    }

    const limit = rateLimit(
      `admin-reports-export:${user.id}`,
      REPORT_EXPORT_LIMIT,
    );
    if (!limit.success) {
      return apiError('rate_limited', 429, { 'Retry-After': '3600' });
    }

    const period = parsePeriod(request.nextUrl.searchParams.get('period'));
    const custom =
      period === 'custom'
        ? {
            from: request.nextUrl.searchParams.get('from') ?? undefined,
            to: request.nextUrl.searchParams.get('to') ?? undefined,
          }
        : undefined;
    const generatedAt = new Date();
    const data = await getReportsData(period, custom, generatedAt);
    const negotiated = negotiateLocale(
      request.cookies.get('NEXT_LOCALE')?.value,
      request.headers.get('accept-language'),
    );
    const locale = resolveLocale(profile.preferred_locale, negotiated);
    const csv = buildReportCsv(data, locale, generatedAt);
    const stamp = generatedAt.toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reports-${data.period.key}-${stamp}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return apiError('report_export_failed', 503);
  }
}
