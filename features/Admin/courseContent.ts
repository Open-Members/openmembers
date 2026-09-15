'use server';

import { requireAdmin } from '@/core/access/admin';

export type AdminLesson = {
  id: string;
  moduleId: string;
  title: string;
  slug: string;
  contentType: 'video' | 'text' | 'quiz';
  description: string | null;
  /** Legacy — kept for backwards compat. New lessons use videoProvider/videoExternalId. */
  youtubeVideoId: string | null;
  videoProvider: 'youtube' | 'vimeo' | 'r2' | null;
  videoExternalId: string | null;
  videoHash: string | null;
  textContent: string | null;
  durationSeconds: number | null;
  sortOrder: number;
  isPublished: boolean;
  isFreePreview: boolean;
  /** Custom ebook cover URL. Overrides the script-generated cover when set. */
  ebookCoverUrl: string | null;
};

export type AdminModule = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  isPublished: boolean;
  lessons: AdminLesson[];
};

export type AdminCourseContent = {
  course: {
    id: string;
    title: string;
    slug: string;
    isPublished: boolean;
    contentFormat: 'video' | 'ebook';
  };
  modules: AdminModule[];
};

export async function getCourseContent(
  slug: string,
): Promise<AdminCourseContent | null> {
  const { supabase } = await requireAdmin();

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title, slug, is_published, content_format')
    .eq('slug', slug)
    .maybeSingle();

  if (courseError) throw new Error('loadFailed');
  if (!course) return null;

  const { data: modules, error: modulesError } = await supabase
    .from('modules')
    .select('id, course_id, title, description, sort_order, is_published')
    .eq('course_id', course.id)
    .order('sort_order');

  if (modulesError) throw new Error('loadFailed');

  const moduleIds = (modules ?? []).map((m) => m.id);

  const lessonsResult = moduleIds.length
    ? await supabase
        .from('lessons')
        .select(
          'id, module_id, title, slug, content_type, description, youtube_video_id, video_provider, video_external_id, video_hash, text_content, duration_seconds, sort_order, is_published, is_free_preview, ebook_cover_url',
        )
        .in('module_id', moduleIds)
        .order('sort_order')
    : { data: [], error: null };

  if (lessonsResult.error) throw new Error('loadFailed');
  const lessons = lessonsResult.data;

  const lessonsByModule = new Map<string, AdminLesson[]>();
  for (const l of lessons ?? []) {
    const arr = lessonsByModule.get(l.module_id) ?? [];
    arr.push({
      id: l.id,
      moduleId: l.module_id,
      title: l.title,
      slug: l.slug,
      contentType: l.content_type as 'video' | 'text' | 'quiz',
      description: l.description ?? null,
      youtubeVideoId: l.youtube_video_id,
      videoProvider: (l.video_provider ?? null) as AdminLesson['videoProvider'],
      videoExternalId: l.video_external_id ?? null,
      videoHash: l.video_hash ?? null,
      textContent: l.text_content,
      durationSeconds: l.duration_seconds,
      sortOrder: l.sort_order,
      isPublished: l.is_published,
      isFreePreview: l.is_free_preview,
      ebookCoverUrl: l.ebook_cover_url ?? null,
    });
    lessonsByModule.set(l.module_id, arr);
  }

  return {
    course: {
      id: course.id,
      title: course.title,
      slug: course.slug,
      isPublished: course.is_published,
      contentFormat: (course.content_format ?? 'video') as 'video' | 'ebook',
    },
    modules: (modules ?? []).map((m) => ({
      id: m.id,
      courseId: m.course_id,
      title: m.title,
      description: m.description,
      sortOrder: m.sort_order,
      isPublished: m.is_published,
      lessons: lessonsByModule.get(m.id) ?? [],
    })),
  };
}
