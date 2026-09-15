import { createAdminClient } from '@/core/supabase/admin';
import { createNotification } from '@/core/notifications/service';
import type { NotificationDescriptor } from '@/core/notifications/messages';

/** Fail-soft side effect after the primary engagement write has committed. */
export async function notifyCommentReply(params: { commentId: string }): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data: reply, error: replyError } = await supabase.from('lesson_comments')
      .select('user_id, parent_id, lesson_id, content')
      .eq('id', params.commentId).maybeSingle();
    if (replyError) throw new Error('commentReplyReadFailed');
    if (!reply?.parent_id) return;

    const { data: parent, error: parentError } = await supabase.from('lesson_comments')
      .select('user_id').eq('id', reply.parent_id).maybeSingle();
    if (parentError) throw new Error('commentParentReadFailed');
    if (!parent || parent.user_id === reply.user_id) return;

    const [replierResult, lessonResult] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', reply.user_id).maybeSingle(),
      supabase.from('lessons')
        .select('title, slug, module:modules(course:courses(slug))')
        .eq('id', reply.lesson_id).maybeSingle(),
    ]);
    if (replierResult.error || lessonResult.error) throw new Error('commentContextReadFailed');

    const lesson = lessonResult.data;
    const courseSlug = (
      lesson?.module as unknown as { course: { slug: string } | null } | null
    )?.course?.slug;
    const actionUrl = courseSlug && lesson?.slug
      ? `/courses/${courseSlug}/${lesson.slug}`
      : null;
    const excerpt = reply.content.length > 180
      ? reply.content.slice(0, 177).trimEnd() + '…'
      : reply.content;
    const displayName = replierResult.data?.display_name?.trim();
    const descriptor: NotificationDescriptor = displayName
      ? {
          key: 'engagement.commentReply',
          params: { replierName: displayName, excerpt },
        }
      : { key: 'engagement.commentReplyAnonymous', params: { excerpt } };

    const result = await createNotification({
      userId: parent.user_id,
      type: 'comment_reply',
      descriptor,
      actionUrl,
    });
    if ('error' in result) throw new Error(result.error);
  } catch (error) {
    console.error('[notify] Failed to dispatch comment-reply:', error);
  }
}

/** Notify only when both course and installation enable certificates. */
export async function notifyCertificateEarned(params: {
  userId: string;
  courseId: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const [courseResult, tenantResult] = await Promise.all([
      supabase.from('courses').select('title, slug, certificate_enabled')
        .eq('id', params.courseId).maybeSingle(),
      supabase.from('tenant_settings').select('certificate_enabled').limit(1).maybeSingle(),
    ]);
    if (courseResult.error || tenantResult.error) throw new Error('certificateContextReadFailed');
    const course = courseResult.data;
    if (!course?.certificate_enabled || !tenantResult.data?.certificate_enabled) return;

    const result = await createNotification({
      userId: params.userId,
      type: 'certificate',
      descriptor: {
        key: 'engagement.certificateEarned',
        params: { courseTitle: course.title },
      },
      actionUrl: `/courses/${course.slug}`,
    });
    if ('error' in result) throw new Error(result.error);
  } catch (error) {
    console.error('[notify] Failed to dispatch certificate-earned:', error);
  }
}
