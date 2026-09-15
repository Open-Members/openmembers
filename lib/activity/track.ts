import { createAdminClient } from '@/core/supabase/admin';
import { notifyCertificateEarned } from '@/features/Notifications/engagement-events';

/**
 * Stamps enrollments.first_accessed_at for every active enrollment of
 * this user whose access_level grants the given course. Idempotent —
 * only touches rows where first_accessed_at IS NULL, so revisits are
 * no-ops. Fail-soft: caller is always a user-facing page, so any error
 * is swallowed.
 */
export async function markCourseFirstAccess(
  userId: string,
  courseId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: accessLevelRows } = await admin
      .from('access_level_courses')
      .select('access_level_id')
      .eq('course_id', courseId);

    const accessLevelIds = (accessLevelRows ?? []).map((r) => r.access_level_id);
    if (accessLevelIds.length === 0) return;

    await admin
      .from('enrollments')
      .update({ first_accessed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('first_accessed_at', null)
      .in('access_level_id', accessLevelIds);
  } catch (err) {
    console.error('[activity] markCourseFirstAccess failed:', err);
  }
}

/**
 * Resolves the course_id that a given lesson_id belongs to (via its
 * module). Returns null if the lesson or its module can't be found.
 */
export async function findCourseIdForLesson(lessonId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: lesson } = await admin
      .from('lessons')
      .select('module_id')
      .eq('id', lessonId)
      .maybeSingle();
    if (!lesson?.module_id) return null;

    const { data: mod } = await admin
      .from('modules')
      .select('course_id')
      .eq('id', lesson.module_id)
      .maybeSingle();
    return mod?.course_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Stamps enrollments.completed_at if the user has now finished every
 * published lesson in the course. Mirrors the counting logic from
 * features/Courses/queries.server.ts::buildCourseProgressMap so
 * "completed" here means the same thing as the 100% badge users see.
 *
 * Idempotent — UPDATE is gated on completed_at IS NULL, so re-calling
 * after the fact (e.g. because another lesson got marked complete) is
 * a no-op.
 */
export async function markCourseCompletedIfReady(
  userId: string,
  courseId: string,
): Promise<{ courseJustCompleted: boolean }> {
  try {
    const admin = createAdminClient();

    const { data: modules } = await admin
      .from('modules')
      .select('id')
      .eq('course_id', courseId)
      .eq('is_published', true);
    const moduleIds = (modules ?? []).map((m) => m.id);
    if (moduleIds.length === 0) return { courseJustCompleted: false };

    const { data: lessons } = await admin
      .from('lessons')
      .select('id')
      .in('module_id', moduleIds)
      .eq('is_published', true);
    const lessonIds = (lessons ?? []).map((l) => l.id);
    if (lessonIds.length === 0) return { courseJustCompleted: false };

    const { count: completedCount } = await admin
      .from('lesson_progress')
      .select('lesson_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_completed', true)
      .in('lesson_id', lessonIds);

    if ((completedCount ?? 0) < lessonIds.length) {
      return { courseJustCompleted: false };
    }

    // Every published lesson complete — stamp the enrollments that grant
    // access to this course, where not already stamped.
    const { data: accessLevels } = await admin
      .from('access_level_courses')
      .select('access_level_id')
      .eq('course_id', courseId);
    const accessLevelIds = (accessLevels ?? []).map((r) => r.access_level_id);
    if (accessLevelIds.length === 0) {
      return { courseJustCompleted: false };
    }

    const { data: stamped } = await admin
      .from('enrollments')
      .update({ completed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('completed_at', null)
      .in('access_level_id', accessLevelIds)
      .select('id');

    // Only fire the notification on the actual false → true transition,
    // i.e. when at least one row was stamped just now.
    if ((stamped?.length ?? 0) > 0) {
      await notifyCertificateEarned({ userId, courseId });
      return { courseJustCompleted: true };
    }
    return { courseJustCompleted: false };
  } catch (err) {
    console.error('[activity] markCourseCompletedIfReady failed:', err);
    return { courseJustCompleted: false };
  }
}

/**
 * Reverses `markCourseCompletedIfReady` by clearing `enrollments.completed_at`
 * on active enrollments that grant access to this course. Called when a user
 * un-marks a lesson — the "course completed" badge must not outlive the fact.
 * Fail-soft for the same reasons as the other helpers here.
 */
export async function markCourseIncomplete(
  userId: string,
  courseId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: accessLevels } = await admin
      .from('access_level_courses')
      .select('access_level_id')
      .eq('course_id', courseId);
    const accessLevelIds = (accessLevels ?? []).map((r) => r.access_level_id);
    if (accessLevelIds.length === 0) return;

    await admin
      .from('enrollments')
      .update({ completed_at: null })
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('completed_at', 'is', null)
      .in('access_level_id', accessLevelIds);
  } catch (err) {
    console.error('[activity] markCourseIncomplete failed:', err);
  }
}
