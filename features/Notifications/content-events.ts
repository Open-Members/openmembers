import { createAdminClient } from '@/core/supabase/admin';
import { createNotifications } from '@/core/notifications/service';
import type { NotificationDescriptor } from '@/core/notifications/messages';

type Page<T> = { data: T[] | null; error: unknown };

async function loadRows<T>(
  query: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query(from, from + 499);
    if (error || !data) throw new Error('notificationAudienceReadFailed');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

async function dispatch(input: {
  userIds: string[];
  type: 'new_course' | 'new_lesson' | 'drip_unlock';
  descriptor: NotificationDescriptor;
  actionUrl: string;
}) {
  const result = await createNotifications(input);
  if ('error' in result) throw new Error(result.error);
}

/** Active, unexpired members of every access level granting the course. */
export async function resolveUsersWithCourseAccess(
  courseId: string,
  now = new Date(),
): Promise<string[]> {
  const supabase = createAdminClient();
  const maps = await loadRows<{ access_level_id: string }>((from, to) =>
    supabase.from('access_level_courses').select('access_level_id')
      .eq('course_id', courseId).order('access_level_id').range(from, to),
  );
  const levelIds = Array.from(new Set(maps.map((row) => row.access_level_id)));
  if (levelIds.length === 0) return [];

  const enrollments = await loadRows<{ user_id: string }>((from, to) =>
    supabase.from('enrollments')
      .select('user_id, profile:profiles!inner(status)')
      .in('access_level_id', levelIds)
      .eq('is_active', true)
      .eq('profile.status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
      .order('id')
      .range(from, to),
  );
  return Array.from(new Set(enrollments.map((row) => row.user_id)));
}

/** Fail-soft side effect after a course becomes published. */
export async function notifyCoursePublished(params: { courseId: string }): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data: course, error } = await supabase.from('courses')
      .select('title, slug').eq('id', params.courseId).maybeSingle();
    if (error) throw new Error('notificationCourseReadFailed');
    if (!course) return;

    const userIds = await resolveUsersWithCourseAccess(params.courseId);
    if (userIds.length === 0) return;
    await dispatch({
      userIds,
      type: 'new_course',
      descriptor: {
        key: 'content.coursePublished',
        params: { courseTitle: course.title },
      },
      actionUrl: `/courses/${course.slug}`,
    });
  } catch (error) {
    console.error('[notify] Failed to dispatch course-published:', error);
  }
}

/** Fail-soft side effect after a reachable lesson becomes published. */
export async function notifyLessonPublished(params: { lessonId: string }): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data: lesson, error } = await supabase.from('lessons')
      .select('title, slug, is_published, module:modules(is_published, course:courses(id, title, slug))')
      .eq('id', params.lessonId).maybeSingle();
    if (error) throw new Error('notificationLessonReadFailed');
    if (!lesson) return;

    const moduleRow = lesson.module as unknown as {
      is_published: boolean;
      course: { id: string; title: string; slug: string } | null;
    } | null;
    if (!lesson.is_published || !moduleRow?.is_published || !moduleRow.course) return;

    const course = moduleRow.course;
    const userIds = await resolveUsersWithCourseAccess(course.id);
    if (userIds.length === 0) return;
    await dispatch({
      userIds,
      type: 'new_lesson',
      descriptor: {
        key: 'content.lessonPublished',
        params: { courseTitle: course.title, lessonTitle: lesson.title },
      },
      actionUrl: `/courses/${course.slug}/${lesson.slug}`,
    });
  } catch (error) {
    console.error('[notify] Failed to dispatch lesson-published:', error);
  }
}

/** Fail-soft fan-out for callers that already resolved the drip audience. */
export async function notifyDripUnlock(params: {
  userIds: string[];
  courseId: string;
  lessonId?: string | null;
  moduleId?: string | null;
}): Promise<void> {
  try {
    if (params.userIds.length === 0) return;
    const supabase = createAdminClient();
    const { data: course, error: courseError } = await supabase.from('courses')
      .select('title, slug').eq('id', params.courseId).maybeSingle();
    if (courseError) throw new Error('notificationCourseReadFailed');
    if (!course) return;

    let descriptor: NotificationDescriptor = {
      key: 'content.dripCourse',
      params: { courseTitle: course.title },
    };
    let actionUrl = `/courses/${course.slug}`;

    if (params.lessonId) {
      const { data: lesson, error } = await supabase.from('lessons')
        .select('title, slug').eq('id', params.lessonId).maybeSingle();
      if (error) throw new Error('notificationLessonReadFailed');
      if (lesson) {
        descriptor = {
          key: 'content.dripLesson',
          params: { courseTitle: course.title, contentTitle: lesson.title },
        };
        actionUrl = `/courses/${course.slug}/${lesson.slug}`;
      }
    } else if (params.moduleId) {
      const { data: moduleRow, error } = await supabase.from('modules')
        .select('title').eq('id', params.moduleId).maybeSingle();
      if (error) throw new Error('notificationModuleReadFailed');
      if (moduleRow) {
        descriptor = {
          key: 'content.dripModule',
          params: { courseTitle: course.title, contentTitle: moduleRow.title },
        };
      }
    }

    await dispatch({
      userIds: params.userIds,
      type: 'drip_unlock',
      descriptor,
      actionUrl,
    });
  } catch (error) {
    console.error('[notify] Failed to dispatch drip-unlock:', error);
  }
}
