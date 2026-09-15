import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import { isUserLessonAccessible } from '@/core/access/server';
import {
  createMaterialSignedUrl,
  downloadMaterialBytes,
} from '@/core/storage/materials';
import { addWatermark } from '@/core/pdf/watermark';
import {
  getCertificatePdfCopy,
  resolveCertificateLocale,
} from '@/core/certificates/localization';
import { negotiateLocale } from '@/core/i18n/negotiation';

export const dynamic = 'force-dynamic';

type AttachmentApiError =
  | 'unauthenticated'
  | 'attachment_unavailable'
  | 'attachment_not_found'
  | 'access_denied'
  | 'attachment_download_failed'
  | 'attachment_processing_failed';

/**
 * GET /api/attachments/:id
 *
 * Authenticated download for a single lesson attachment.
 *   - Auth required; 401 otherwise.
 *   - Shared lesson authorization checks active profile, publication, enrollment/preview and drip.
 *   - PDFs: streamed through the server with a watermark stamped on every page.
 *   - Other files: 302 redirect to a signed URL (5-minute TTL).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const inline = req.nextUrl.searchParams.get('inline') === '1';

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return apiError('attachment_unavailable', 503);
    if (!user) return apiError('unauthenticated', 401);

    // Admin client bypasses RLS to fetch the whole chain in one go.
    const admin = createAdminClient();
    const { data: attachment, error: attachmentError } = await admin
      .from('lesson_attachments')
      .select(`
        id, file_name, file_url, file_type,
        lessons!inner (
          id
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (attachmentError) return apiError('attachment_unavailable', 503);
    if (!attachment) return apiError('attachment_not_found', 404);

    const lesson = attachment.lessons as unknown as { id: string } | null;
    if (!lesson || !(await isUserLessonAccessible(user.id, lesson.id))) {
      return apiError('access_denied', 403);
    }

    const objectPath = attachment.file_url as string;
    const mime =
      (attachment.file_type as string | null) ?? 'application/octet-stream';
    const fileName = (attachment.file_name as string) || 'download';

    // Non-PDF → short-lived signed URL, let the browser fetch from Supabase directly.
    if (mime !== 'application/pdf') {
      try {
        const url = await createMaterialSignedUrl(objectPath, 5 * 60);
        const response = NextResponse.redirect(url, 302);
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      } catch {
        return apiError('attachment_download_failed', 500);
      }
    }

    // PDF → download, watermark, stream.
    try {
      const downloadedAt = new Date().toISOString();
      const [bytes, profileResult] = await Promise.all([
        downloadMaterialBytes(objectPath),
        admin
          .from('profiles')
          .select('display_name, preferred_locale')
          .eq('id', user.id)
          .maybeSingle(),
      ]);
      if (profileResult.error || !profileResult.data) {
        return apiError('attachment_unavailable', 503);
      }

      const locale = resolveCertificateLocale(
        profileResult.data.preferred_locale,
        negotiateLocale(
          req.cookies.get('NEXT_LOCALE')?.value,
          req.headers.get('accept-language'),
        ),
      );
      const displayName =
        profileResult.data.display_name?.trim() ||
        user.email ||
        getCertificatePdfCopy(locale).studentFallback;
      const watermarked = await addWatermark(bytes, {
        name: displayName,
        email: user.email ?? '',
        locale,
        downloadedAt,
      });

      const body = new Blob([new Uint8Array(watermarked)], {
        type: 'application/pdf',
      });
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeFileName(fileName)}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch {
      return apiError('attachment_processing_failed', 500);
    }
  } catch {
    return apiError('attachment_unavailable', 503);
  }
}

function apiError(error: AttachmentApiError, status: number) {
  return NextResponse.json({ error }, { status });
}

function encodeFileName(name: string): string {
  // Keep it simple — strip quotes and non-ASCII for the header, keep the
  // extension recognizable.
  return name.replace(/["]/g, '').replace(/[^\x20-\x7E]/g, '_');
}
