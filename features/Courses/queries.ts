import { createClient } from '@/core/supabase/client';
import type {
  CourseWithProgress,
  CourseDetail,
  LessonWithProgress,
  ModuleWithLessonsAndProgress,
} from './types';
import type { Course } from '@/shared/types/interfaces';

// ─── Student: Enrolled courses with progress ────────────────────────────────

export async function fetchEnrolledCourses(userId: string): Promise<CourseWithProgress[]> {
  const supabase = createClient();

  // Get course IDs the user has access to via enrollments → access_levels → access_level_courses
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('access_level_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!enrollments?.length) return [];

  const accessLevelIds = enrollments.map(e => e.access_level_id);

  const { data: accessLevelCourses } = await supabase
    .from('access_level_courses')
    .select('course_id')
    .in('access_level_id', accessLevelIds);

  if (!accessLevelCourses?.length) return [];

  const courseIds = [...new Set(accessLevelCourses.map(a => a.course_id))];

  // Fetch courses
  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .in('id', courseIds)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  if (!courses?.length) return [];

  // For each course, count total lessons and completed lessons
  const results: CourseWithProgress[] = [];

  for (const course of courses) {
    // Get all modules for this course
    const { data: modules } = await supabase
      .from('modules')
      .select('id')
      .eq('course_id', course.id)
      .eq('is_published', true);

    const moduleIds = (modules ?? []).map(m => m.id);

    let totalLessons = 0;
    let completedLessons = 0;

    if (moduleIds.length > 0) {
      // Count published lessons in these modules
      const { count: lessonCount } = await supabase
        .from('lessons')
        .select('*', { count: 'exact', head: true })
        .in('module_id', moduleIds)
        .eq('is_published', true);

      totalLessons = lessonCount ?? 0;

      // Count completed lessons for this user
      const { data: lessonIds } = await supabase
        .from('lessons')
        .select('id')
        .in('module_id', moduleIds)
        .eq('is_published', true);

      if (lessonIds?.length) {
        const { count: completedCount } = await supabase
          .from('lesson_progress')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_completed', true)
          .in('lesson_id', lessonIds.map(l => l.id));

        completedLessons = completedCount ?? 0;
      }
    }

    results.push({
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description ?? undefined,
      thumbnailUrl: course.thumbnail_url ?? undefined,
      isPublished: course.is_published,
      sortOrder: course.sort_order,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
      totalLessons,
      completedLessons,
      progressPercent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      // Resume target is only computed server-side; this client helper is unused today.
      resumeLessonSlug: null,
    });
  }

  return results;
}

// ─── Student: Course detail with modules, lessons, and progress ─────────────

export async function fetchCourseBySlug(slug: string, userId: string): Promise<CourseDetail | null> {
  const supabase = createClient();

  // Fetch the course
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  if (!course) return null;

  // Fetch modules ordered by sort_order
  const { data: modules } = await supabase
    .from('modules')
    .select('*')
    .eq('course_id', course.id)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  if (!modules?.length) {
    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description ?? undefined,
      thumbnailUrl: course.thumbnail_url ?? undefined,
      isPublished: course.is_published,
      sortOrder: course.sort_order,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
      modules: [],
      totalLessons: 0,
      completedLessons: 0,
      progressPercent: 0,
    };
  }

  const moduleIds = modules.map(m => m.id);

  // Fetch all lessons for these modules
  const { data: lessons } = await supabase
    .from('lessons')
    .select('*')
    .in('module_id', moduleIds)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  const allLessonIds = (lessons ?? []).map(l => l.id);

  // Fetch progress for user
  const { data: progressRows } = allLessonIds.length > 0
    ? await supabase
        .from('lesson_progress')
        .select('*')
        .eq('user_id', userId)
        .in('lesson_id', allLessonIds)
    : { data: [] };

  const progressMap = new Map((progressRows ?? []).map(p => [p.lesson_id, p]));

  // Fetch attachments for all lessons
  const { data: attachments } = allLessonIds.length > 0
    ? await supabase
        .from('lesson_attachments')
        .select('*')
        .in('lesson_id', allLessonIds)
        .order('sort_order', { ascending: true })
    : { data: [] };

  const attachmentMap = new Map<string, typeof attachments>();
  for (const att of attachments ?? []) {
    const list = attachmentMap.get(att.lesson_id) ?? [];
    list.push(att);
    attachmentMap.set(att.lesson_id, list);
  }

  // Assemble modules with lessons and progress
  let totalLessons = 0;
  let completedLessons = 0;

  const modulesWithProgress: ModuleWithLessonsAndProgress[] = modules.map(mod => {
    const moduleLessons = (lessons ?? []).filter(l => l.module_id === mod.id);

    const lessonsWithProgress: LessonWithProgress[] = moduleLessons.map(lesson => {
      totalLessons++;
      const prog = progressMap.get(lesson.id);
      if (prog?.is_completed) completedLessons++;

      const lessonAttachments = (attachmentMap.get(lesson.id) ?? []).map(a => ({
        id: a.id,
        lessonId: a.lesson_id,
        fileName: a.file_name,
        fileUrl: a.file_url,
        fileType: a.file_type,
        fileSizeBytes: a.file_size_bytes ?? undefined,
        sortOrder: a.sort_order,
      }));

      return {
        id: lesson.id,
        moduleId: lesson.module_id,
        title: lesson.title,
        slug: lesson.slug,
        contentType: lesson.content_type as 'video' | 'text' | 'quiz',
        youtubeVideoId: lesson.youtube_video_id ?? undefined,
        textContent: lesson.text_content ?? undefined,
        durationSeconds: lesson.duration_seconds ?? undefined,
        sortOrder: lesson.sort_order,
        isPublished: lesson.is_published,
        isFreePreview: lesson.is_free_preview,
        progress: prog
          ? {
              id: prog.id,
              userId: prog.user_id,
              lessonId: prog.lesson_id,
              isCompleted: prog.is_completed,
              completedAt: prog.completed_at ?? undefined,
              videoPositionSeconds: prog.video_position_seconds ?? 0,
            }
          : undefined,
        attachments: lessonAttachments,
      };
    });

    return {
      id: mod.id,
      courseId: mod.course_id,
      title: mod.title,
      description: mod.description ?? undefined,
      sortOrder: mod.sort_order,
      isPublished: mod.is_published,
      lessons: lessonsWithProgress,
    };
  });

  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    description: course.description ?? undefined,
    thumbnailUrl: course.thumbnail_url ?? undefined,
    isPublished: course.is_published,
    sortOrder: course.sort_order,
    createdAt: course.created_at,
    updatedAt: course.updated_at,
    modules: modulesWithProgress,
    totalLessons,
    completedLessons,
    progressPercent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
  };
}

// ─── Student: Lesson detail with attachments and progress ───────────────────

export async function fetchLessonDetail(lessonId: string, userId: string): Promise<LessonWithProgress | null> {
  const supabase = createClient();

  const { data: lesson } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .single();

  if (!lesson) return null;

  // Fetch attachments
  const { data: attachments } = await supabase
    .from('lesson_attachments')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('sort_order', { ascending: true });

  // Fetch user progress
  const { data: progress } = await supabase
    .from('lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .single();

  return {
    id: lesson.id,
    moduleId: lesson.module_id,
    title: lesson.title,
    slug: lesson.slug,
    contentType: lesson.content_type as 'video' | 'text' | 'quiz',
    youtubeVideoId: lesson.youtube_video_id ?? undefined,
    textContent: lesson.text_content ?? undefined,
    durationSeconds: lesson.duration_seconds ?? undefined,
    sortOrder: lesson.sort_order,
    isPublished: lesson.is_published,
    isFreePreview: lesson.is_free_preview,
    progress: progress
      ? {
          id: progress.id,
          userId: progress.user_id,
          lessonId: progress.lesson_id,
          isCompleted: progress.is_completed,
          completedAt: progress.completed_at ?? undefined,
          videoPositionSeconds: progress.video_position_seconds ?? 0,
        }
      : undefined,
    attachments: (attachments ?? []).map(a => ({
      id: a.id,
      lessonId: a.lesson_id,
      fileName: a.file_name,
      fileUrl: a.file_url,
      fileType: a.file_type,
      fileSizeBytes: a.file_size_bytes ?? undefined,
      sortOrder: a.sort_order,
    })),
  };
}

// ─── Admin: All courses (published and draft) ───────────────────────────────

export async function fetchAllCourses(): Promise<Course[]> {
  const supabase = createClient();

  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .order('sort_order', { ascending: true });

  return (courses ?? []).map(c => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    description: c.description ?? undefined,
    thumbnailUrl: c.thumbnail_url ?? undefined,
    isPublished: c.is_published,
    sortOrder: c.sort_order,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));
}
