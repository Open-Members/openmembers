import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/core/supabase/server';
import { fetchLessonBySlugServer } from '@/features/Courses/queries.server';
import { LessonPlayerPage } from '@/features/Courses/components/LessonPlayerPage';
import { EbookReader } from '@/features/Courses/components/EbookReader';
import { getTenantSettings } from '@/core/theme/settings';
import { hasCourseChatConfiguration } from '@/core/config/capabilities.server';

export const dynamic = 'force-dynamic';

function parseSeekParam(
  raw: string | string[] | undefined,
): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 && n < 86_400 ? n : undefined;
}

export default async function LessonPlayerRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { slug, lessonSlug } = await params;
  const { t } = await searchParams;
  const seekToSeconds = parseSeekParam(t);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const result = await fetchLessonBySlugServer(slug, lessonSlug, user.id);
  if (!result) notFound();

  // Server-side access gate:
  //   - No access + not a free preview → bounce to the course overview
  //   - Drip-locked → bounce to overview (where the unlock date is shown)
  if (!result.isAccessible && !result.isFreePreview) {
    redirect(`/courses/${slug}`);
  }
  if (result.isDripLocked) {
    redirect(`/courses/${slug}`);
  }

  // Ebook courses get a dedicated PDF reader instead of the video player.
  if (result.course.contentFormat === 'ebook') {
    const primaryAttachment = result.lesson.attachments[0] ?? null;
    return (
      <EbookReader
        course={{ slug: result.course.slug, title: result.course.title }}
        lesson={{
          id: result.lesson.id,
          title: result.lesson.title,
          description: result.lesson.description,
          isCompleted: result.lesson.progress?.isCompleted ?? false,
        }}
        attachment={
          primaryAttachment
            ? {
                id: primaryAttachment.id,
                fileName: primaryAttachment.fileName,
                fileSizeBytes: primaryAttachment.fileSizeBytes,
              }
            : null
        }
        modules={result.modules.map((m) => ({
          id: m.id,
          title: m.title,
          lessons: m.lessons.map((l) => ({
            id: l.id,
            slug: l.slug,
            title: l.title,
            isCompleted: l.progress?.isCompleted ?? false,
          })),
        }))}
      />
    );
  }

  // Admin flag for comment moderation inside the player
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const tenant = await getTenantSettings();
  // Video bg is always dark, so we want the *dark-mode* variant (which
  // by project convention is the light/white-on-transparent logo — see
  // TopNav.tsx). Fall back through the legacy single logo, then the
  // light variant as last resort.
  const watermarkUrl =
    tenant.logo_dark_url ?? tenant.logo_url ?? tenant.logo_light_url;

  return (
    <LessonPlayerPage
      data={{
        ...result,
        currentUserId: user.id,
        isAdmin,
      }}
      watermarkUrl={watermarkUrl}
      seekToSeconds={seekToSeconds}
      chatEnabled={hasCourseChatConfiguration()}
    />
  );
}
