import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/core/supabase/server';
import { buildCertificatePdf } from '@/core/certificates/service';
import { rateLimit } from '@/core/rate-limit';
import { isUserCourseAccessible } from '@/core/access/server';
import { negotiateLocale } from '@/core/i18n/negotiation';
import { isSafeCertificateFileName } from '@/core/certificates/localization';

export const dynamic = 'force-dynamic';

// PDF rendering with pdf-lib + watermarking is CPU-heavy. 20/hour per
// user is far above any sane click cadence (a student usually downloads
// once and we serve the cached row), but bounds a runaway browser tab.
const CERT_LIMIT = { maxRequests: 20, windowMs: 60 * 60_000 };

type CertificateApiError =
  | 'unauthenticated'
  | 'access_denied'
  | 'rate_limited'
  | 'course_not_found'
  | 'cert_disabled'
  | 'not_complete'
  | 'certificate_unavailable'
  | 'certificate_generation_failed';

/**
 * GET /api/certificates/:courseId
 *
 *   - Auth required
 *   - User must have finished every published lesson in the course
 *   - Course + tenant must both have certificates enabled
 *   - Issues (or reuses) a certificate row, then streams the PDF with the
 *     recipient's name, course title, date, and verification code
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await ctx.params;

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return apiError('certificate_unavailable', 503);
    if (!user) return apiError('unauthenticated', 401);
    if (!(await isUserCourseAccessible(user.id, courseId))) {
      return apiError('access_denied', 403);
    }

    const rl = rateLimit(`cert:${user.id}`, CERT_LIMIT);
    if (!rl.success) {
      return apiError('rate_limited', 429, { 'Retry-After': '3600' });
    }

    const result = await buildCertificatePdf(user.id, courseId, {
      localeHint: negotiateLocale(
        req.cookies.get('NEXT_LOCALE')?.value,
        req.headers.get('accept-language'),
      ),
      now: new Date(),
    });
    if ('error' in result) {
      const status =
        result.error === 'course_not_found'
          ? 404
          : result.error === 'cert_disabled' || result.error === 'not_complete'
            ? 403
            : result.error === 'certificate_unavailable'
              ? 503
              : 500;
      return apiError(result.error, status);
    }
    if (!isSafeCertificateFileName(result.fileName)) {
      return apiError('certificate_generation_failed', 500);
    }

    const body = new Blob([new Uint8Array(result.bytes)], {
      type: 'application/pdf',
    });
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return apiError('certificate_unavailable', 503);
  }
}

function apiError(
  error: CertificateApiError,
  status: number,
  headers?: Record<string, string>,
) {
  return NextResponse.json({ error }, { status, headers });
}
