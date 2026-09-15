import { createAdminClient } from '@/core/supabase/admin';
import { createNotification } from '@/core/notifications/service';

/**
 * Drops a welcome notification when a user gains access to a product.
 * Used by webhook-driven purchases (Stripe/Hotmart/Guru) and by manual
 * admin enrollment. Fail-soft: a bad insert must not break the caller.
 */
export async function notifyEnrollment(params: {
  userId: string;
  accessLevelId: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();

    const [levelResult, coursesResult] = await Promise.all([
      supabase
        .from('access_levels')
        .select('name')
        .eq('id', params.accessLevelId)
        .maybeSingle(),
      supabase
        .from('access_level_courses')
        .select('course:courses(title, slug)')
        .eq('access_level_id', params.accessLevelId),
    ]);
    if (levelResult.error || coursesResult.error) {
      throw new Error('enrollmentNotificationReadFailed');
    }
    const level = levelResult.data;
    const courseRows = coursesResult.data;
    if (!level) return;

    const courses = (courseRows ?? [])
      .map((r) => r.course as unknown as { title: string; slug: string } | null)
      .filter((c): c is { title: string; slug: string } => c !== null);
    // Only point the CTA at a specific course when there's exactly one in
    // the access level. For a multi-course membership picking any single
    // course title looks arbitrary; send them to the dashboard instead.
    const singleCourse = courses.length === 1 ? courses[0] : null;

    const result = await createNotification({
      userId: params.userId,
      type: 'enrollment',
      descriptor: singleCourse
        ? {
            key: 'enrollment.singleCourse',
            params: { levelName: level.name, courseTitle: singleCourse.title },
          }
        : {
            key: 'enrollment.dashboard',
            params: { levelName: level.name },
          },
      actionUrl: singleCourse ? `/courses/${singleCourse.slug}` : '/dashboard',
    });
    if ('error' in result) throw new Error(result.error);
  } catch (err) {
    console.error('[enrollment] Failed to dispatch notification:', err);
  }
}
