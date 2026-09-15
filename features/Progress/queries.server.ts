import { createClient } from '@/core/supabase/server';

export interface CourseProgressInfo {
  completed: number;
  total: number;
  percentage: number;
}

export async function getCourseProgress(
  userId: string,
  courseId: string,
): Promise<CourseProgressInfo> {
  const supabase = await createClient();

  const { data: modules } = await supabase
    .from('modules')
    .select('id')
    .eq('course_id', courseId)
    .eq('is_published', true);

  const moduleIds = (modules ?? []).map(m => m.id);
  if (moduleIds.length === 0) {
    return { completed: 0, total: 0, percentage: 0 };
  }

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id')
    .in('module_id', moduleIds)
    .eq('is_published', true);

  const lessonIds = (lessons ?? []).map(l => l.id);
  const total = lessonIds.length;
  if (total === 0) {
    return { completed: 0, total: 0, percentage: 0 };
  }

  const { count: completedCount } = await supabase
    .from('lesson_progress')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_completed', true)
    .in('lesson_id', lessonIds);

  const completed = completedCount ?? 0;

  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
  };
}

export async function getAllCoursesProgress(
  userId: string,
): Promise<Map<string, CourseProgressInfo>> {
  const supabase = await createClient();

  // Get all courses the user is enrolled in
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('access_level_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!enrollments?.length) return new Map();

  const accessLevelIds = enrollments.map(e => e.access_level_id);

  const { data: accessLevelCourses } = await supabase
    .from('access_level_courses')
    .select('course_id')
    .in('access_level_id', accessLevelIds);

  if (!accessLevelCourses?.length) return new Map();

  const courseIds = [...new Set(accessLevelCourses.map(a => a.course_id))];

  const result = new Map<string, CourseProgressInfo>();

  for (const courseId of courseIds) {
    const progress = await getCourseProgress(userId, courseId);
    result.set(courseId, progress);
  }

  return result;
}
