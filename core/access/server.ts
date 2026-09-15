import { cache } from 'react';
import { createClient } from '@/core/supabase/server';

/** Session identity is verified before any caller-supplied user ID is used. */
const getActiveSession = cache(async () => {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile || profile.status !== 'active') return null;
    return { supabase, userId: user.id };
  } catch {
    return null;
  }
});

/** The session-bound database function is the authority for course access. */
export const isUserCourseAccessible = cache(async (
  userId: string | null | undefined,
  courseId: string,
): Promise<boolean> => {
  if (!userId || !courseId) return false;
  const session = await getActiveSession();
  if (!session || session.userId !== userId) return false;
  try {
    const { data, error } = await session.supabase.rpc('can_access_course', {
      p_course_id: courseId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
});

/** Includes profile status, publication, enrollment/expiry, previews and drip. */
export const isUserLessonAccessible = cache(async (
  userId: string | null | undefined,
  lessonId: string,
): Promise<boolean> => {
  if (!userId || !lessonId) return false;
  const session = await getActiveSession();
  if (!session || session.userId !== userId) return false;
  try {
    const { data, error } = await session.supabase.rpc('can_access_lesson', {
      p_lesson_id: lessonId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
});

export const getUserCourseAccess = cache(async (
  userId: string | null | undefined,
): Promise<Set<string>> => {
  const access = new Set<string>();
  if (!userId) return access;
  const session = await getActiveSession();
  if (!session || session.userId !== userId) return access;
  const { data: courses, error } = await session.supabase.from('courses').select('id');
  if (error || !courses) return access;
  const decisions = await Promise.all(courses.map(async (course) => ({
    id: course.id as string,
    allowed: await isUserCourseAccessible(userId, course.id),
  })));
  for (const course of decisions) if (course.allowed) access.add(course.id);
  return access;
});

/** Ownership is for catalog presentation and deliberately has no admin bypass. */
export const getUserOwnedCourses = cache(async (
  userId: string | null | undefined,
): Promise<Set<string>> => {
  const owned = new Set<string>();
  if (!userId) return owned;
  const session = await getActiveSession();
  if (!session || session.userId !== userId) return owned;
  const { supabase } = session;
  const nowIso = new Date().toISOString();
  const [{ data: courses, error: coursesError }, { data: enrollments, error: enrollmentError }] = await Promise.all([
    supabase.from('courses').select('id, is_free').eq('is_published', true).eq('is_coming_soon', false),
    supabase.from('enrollments').select('access_level_id').eq('user_id', userId)
      .eq('is_active', true).or(`expires_at.is.null,expires_at.gt.${nowIso}`),
  ]);
  if (coursesError || enrollmentError || !courses) return owned;
  for (const course of courses) if (course.is_free) owned.add(course.id);
  const levelIds = (enrollments ?? []).map((enrollment) => enrollment.access_level_id);
  if (levelIds.length) {
    const { data: mappings, error } = await supabase.from('access_level_courses')
      .select('course_id').in('access_level_id', levelIds);
    if (error) return owned;
    const published = new Set(courses.map((course) => course.id));
    for (const mapping of mappings ?? []) if (published.has(mapping.course_id)) owned.add(mapping.course_id);
  }
  return owned;
});
