'use server';

import { createClient } from '@/core/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  createCourseSchema,
  updateCourseSchema,
  createModuleSchema,
  createLessonSchema,
  formDataToObject,
} from '@/core/validation/schemas';
import { bulkDeleteObjects } from '@/lib/services/r2/presign';
import { isR2Configured } from '@/lib/services/r2/client';
import type { UserRole } from '@/shared/types/interfaces';
import {
  notifyCoursePublished,
  notifyLessonPublished,
} from '@/features/Notifications/content-events';

// ─── Auth guard — only admin/super_admin may call these ─────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthenticated');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (
    profileError ||
    profile?.status !== 'active' ||
    (profile?.role !== 'admin' && profile?.role !== 'super_admin')
  ) {
    throw new Error('Forbidden');
  }
  return { supabase, callerId: user.id, callerRole: profile.role as UserRole };
}

// ─── Course CRUD ────────────────────────────────────────────────────────────

export async function createCourse(formData: FormData) {
  const { supabase } = await requireAdmin();

  const raw = formDataToObject(formData);
  const parsed = createCourseSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'invalidInput' };
  }

  const { data, error } = await supabase
    .from('courses')
    .insert({
      title: parsed.data.title,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      is_published: false,
      sort_order: 0,
    })
    .select('slug')
    .single();

  if (error || !data) return { error: 'operationFailed' };

  revalidatePath('/admin/courses');
  return { success: true, data: { slug: data.slug } };
}

export async function updateCourse(formData: FormData) {
  const { supabase } = await requireAdmin();

  const raw = formDataToObject(formData);
  const parsed = updateCourseSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'invalidInput' };
  }

  const { id, ...updates } = parsed.data;

  // Build snake_case update object from provided fields.
  const updateObj: Record<string, unknown> = {};
  if (updates.title !== undefined) updateObj.title = updates.title;
  if (updates.slug !== undefined) updateObj.slug = updates.slug;
  if (updates.description !== undefined)
    updateObj.description = updates.description;

  // ── Phase A extensions ──
  // Keys passed here come from the CourseEditor form; they live outside the
  // zod schema to keep the schema minimal and shared with the simple create flow.
  const ext = (key: string) => formData.get(key);

  // Text / numeric fields
  if (ext('shortDescription') !== null) {
    updateObj.short_description = (ext('shortDescription') as string) || null;
  }
  if (ext('trailerYoutubeId') !== null) {
    updateObj.trailer_youtube_id = (ext('trailerYoutubeId') as string) || null;
  }
  // Track the previous trailer key so we can delete it from R2 after the
  // update commits — admin replaced or cleared the trailer and otherwise
  // the bytes would leak. Only query when the form actually carries the
  // field, so unrelated saves skip the extra round-trip.
  let previousTrailerR2Key: string | null = null;
  const trailerR2KeyProvided = ext('trailerR2Key') !== null;
  if (trailerR2KeyProvided) {
    updateObj.trailer_r2_key = (ext('trailerR2Key') as string).trim() || null;
    const { data: existing, error: existingError } = await supabase
      .from('courses')
      .select('trailer_r2_key')
      .eq('id', id)
      .maybeSingle();
    if (existingError) return { error: 'operationFailed' };
    if (!existing) return { error: 'notFound' };
    previousTrailerR2Key = existing?.trailer_r2_key ?? null;
  }
  if (ext('durationMinutes') !== null) {
    const raw = ext('durationMinutes') as string;
    const n = raw ? parseInt(raw, 10) : NaN;
    updateObj.duration_minutes = Number.isFinite(n) && n > 0 ? n : null;
  }
  if (ext('instructorId') !== null) {
    const v = ext('instructorId') as string;
    updateObj.instructor_id = v && v !== 'null' ? v : null;
  }
  if (ext('checkoutUrl') !== null) {
    updateObj.checkout_url = (ext('checkoutUrl') as string).trim() || null;
  }
  if (ext('contentFormat') !== null) {
    const v = ext('contentFormat') as string;
    updateObj.content_format = v === 'ebook' ? 'ebook' : 'video';
  }

  // Image URL fields (passed as strings; empty means "clear")
  const imageFields: Array<[string, string]> = [
    ['thumbnailUrl', 'thumbnail_url'],
    ['thumbnailLandscapeUrl', 'thumbnail_landscape_url'],
    ['thumbnailPortraitUrl', 'thumbnail_portrait_url'],
    ['heroBannerUrl', 'hero_banner_url'],
  ];
  for (const [formKey, dbKey] of imageFields) {
    const v = formData.get(formKey);
    if (v !== null) updateObj[dbKey] = (v as string) || null;
  }

  // Boolean flags (checkbox form values: 'true' | 'false')
  if (ext('isFeatured') !== null) {
    updateObj.is_featured = ext('isFeatured') === 'true';
  }
  if (ext('isNew') !== null) {
    updateObj.is_new = ext('isNew') === 'true';
  }
  if (ext('isFree') !== null) {
    updateObj.is_free = ext('isFree') === 'true';
  }
  if (ext('isComingSoon') !== null) {
    updateObj.is_coming_soon = ext('isComingSoon') === 'true';
  }
  if (ext('certificateEnabled') !== null) {
    updateObj.certificate_enabled = ext('certificateEnabled') === 'true';
  }
  if (ext('heroShowText') !== null) {
    updateObj.hero_show_text = ext('heroShowText') === 'true';
  }
  if (ext('heroOverlayOpacity') !== null) {
    const raw = ext('heroOverlayOpacity') as string;
    const n = parseInt(raw, 10);
    // DB CHECK constraint is 0..100; clamp defensively so a bad form
    // submission can't reject the whole update.
    if (Number.isFinite(n)) {
      updateObj.hero_overlay_opacity = Math.max(0, Math.min(100, n));
    }
  }

  if (Object.keys(updateObj).length === 0) {
    return { error: 'invalidInput' };
  }

  updateObj.updated_at = new Date().toISOString();

  const { data: changed, error } = await supabase
    .from('courses')
    .update(updateObj)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!changed) return { error: 'notFound' };

  // Free the old trailer bytes. Fail-soft — the DB update already landed
  // and an R2 hiccup shouldn't surface as a save error to the admin.
  if (
    trailerR2KeyProvided &&
    previousTrailerR2Key &&
    previousTrailerR2Key !== updateObj.trailer_r2_key &&
    isR2Configured()
  ) {
    await bulkDeleteObjects([previousTrailerR2Key]);
  }

  revalidatePath('/admin/courses');
  revalidatePath('/admin/content');
  return { success: true };
}

export async function deleteCourse(id: string) {
  const { supabase } = await requireAdmin();

  // Collect R2 video keys across every lesson in every module of this course
  // so we can free the bytes after the cascade sweep. Admin action isn't
  // blocked if R2 hiccups — bulkDeleteObjects fails soft.
  const r2Keys = await collectCourseR2Keys(supabase, id);

  const { data: deleted, error } = await supabase
    .from('courses')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!deleted) return { error: 'notFound' };

  if (r2Keys.length > 0 && isR2Configured()) {
    await bulkDeleteObjects(r2Keys);
  }

  revalidatePath('/admin/courses');
  return { success: true };
}

async function collectCourseR2Keys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: string,
): Promise<string[]> {
  const { data: modules, error: modulesError } = await supabase
    .from('modules')
    .select('id')
    .eq('course_id', courseId);
  if (modulesError) throw new Error('loadFailed');
  const moduleIds = (modules ?? []).map((m: { id: string }) => m.id);
  if (moduleIds.length === 0) return [];

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('video_external_id')
    .in('module_id', moduleIds)
    .eq('video_provider', 'r2');
  if (lessonsError) throw new Error('loadFailed');

  return (lessons ?? [])
    .map((l: { video_external_id: string | null }) => l.video_external_id)
    .filter((k: string | null): k is string => Boolean(k));
}

export async function toggleCoursePublished(id: string) {
  const { supabase } = await requireAdmin();

  // Fetch current state
  const { data: course, error: fetchError } = await supabase
    .from('courses')
    .select('is_published')
    .eq('id', id)
    .single();

  if (fetchError) return { error: 'operationFailed' };
  if (!course) return { error: 'notFound' };

  const nextPublished = !course.is_published;

  const { data: changed, error } = await supabase
    .from('courses')
    .update({
      is_published: nextPublished,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!changed) return { error: 'notFound' };

  // Fan out notifications only on the false → true transition.
  if (nextPublished) {
    await notifyCoursePublished({ courseId: id });
  }

  revalidatePath('/admin/courses');
  return { success: true, data: { isPublished: nextPublished } };
}

// ─── Module CRUD ────────────────────────────────────────────────────────────

export async function createModule(formData: FormData) {
  const { supabase } = await requireAdmin();

  const raw = formDataToObject(formData);
  const parsed = createModuleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'invalidInput' };
  }

  // Determine next sort_order for this course
  const { data: lastModule, error: lastModuleError } = await supabase
    .from('modules')
    .select('sort_order')
    .eq('course_id', parsed.data.courseId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastModuleError) return { error: 'operationFailed' };

  const nextOrder = (lastModule?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('modules')
    .insert({
      course_id: parsed.data.courseId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      sort_order: nextOrder,
      is_published: false,
    })
    .select('id')
    .single();

  if (error || !data) return { error: 'operationFailed' };

  revalidatePath('/admin/courses');
  return { success: true, data: { id: data.id } };
}

export async function updateModule(id: string, formData: FormData) {
  const { supabase } = await requireAdmin();

  const raw = formDataToObject(formData);

  const updateObj: Record<string, unknown> = {};
  if (raw.title !== undefined) {
    if (!raw.title.trim()) return { error: 'titleRequired' };
    updateObj.title = raw.title.trim();
  }
  if (raw.description !== undefined)
    updateObj.description = raw.description || null;
  if (raw.isPublished !== undefined)
    updateObj.is_published = raw.isPublished === 'true';

  updateObj.updated_at = new Date().toISOString();

  const { data: changed, error } = await supabase
    .from('modules')
    .update(updateObj)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!changed) return { error: 'notFound' };

  revalidatePath('/admin/courses');
  return { success: true };
}

export async function deleteModule(id: string) {
  const { supabase } = await requireAdmin();

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('video_external_id')
    .eq('module_id', id)
    .eq('video_provider', 'r2');
  if (lessonsError) return { error: 'operationFailed' };
  const r2Keys = (lessons ?? [])
    .map((l) => l.video_external_id)
    .filter((k): k is string => Boolean(k));

  const { data: deleted, error } = await supabase
    .from('modules')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!deleted) return { error: 'notFound' };

  if (r2Keys.length > 0 && isR2Configured()) {
    await bulkDeleteObjects(r2Keys);
  }

  revalidatePath('/admin/courses');
  return { success: true };
}

export async function reorderModules(courseId: string, orderedIds: string[]) {
  const { supabase } = await requireAdmin();
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { error: 'invalidInput' };
  }

  const updates = orderedIds.map((id, index) =>
    supabase
      .from('modules')
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('course_id', courseId)
      .select('id')
      .maybeSingle(),
  );

  const results = await Promise.all(updates);
  if (results.some((result) => result.error))
    return { error: 'operationFailed' };
  if (results.some((result) => !result.data)) return { error: 'notFound' };

  revalidatePath('/admin/courses');
  return { success: true };
}

// ─── Lesson CRUD ────────────────────────────────────────────────────────────

export async function createLesson(formData: FormData) {
  const { supabase } = await requireAdmin();

  const raw = formDataToObject(formData);
  const parsed = createLessonSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'invalidInput' };
  }

  // Determine next sort_order for this module
  const { data: lastLesson, error: lastLessonError } = await supabase
    .from('lessons')
    .select('sort_order')
    .eq('module_id', parsed.data.moduleId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastLessonError) return { error: 'operationFailed' };

  const nextOrder = (lastLesson?.sort_order ?? -1) + 1;

  // Derive unified video_provider / video_external_id from the YouTube-only
  // legacy input. `LessonDialog` writes both the legacy and the new fields
  // via FormData directly; read them here so we don't drop them on create.
  const videoProvider = formData.get('videoProvider')?.toString() || null;
  const videoExternalId = formData.get('videoExternalId')?.toString() || null;
  const videoHash = formData.get('videoHash')?.toString() || null;
  const ebookCoverUrl = formData.get('ebookCoverUrl');

  const insertPayload: Record<string, unknown> = {
    module_id: parsed.data.moduleId,
    title: parsed.data.title,
    slug: parsed.data.slug,
    content_type: parsed.data.contentType,
    description: parsed.data.description ?? null,
    youtube_video_id: parsed.data.youtubeVideoId ?? null,
    text_content: parsed.data.textContent ?? null,
    sort_order: nextOrder,
    is_published: false,
    is_free_preview: false,
  };
  if (ebookCoverUrl !== null) {
    insertPayload.ebook_cover_url = (ebookCoverUrl as string) || null;
  }
  // Prefer explicit provider fields; fall back to legacy YouTube shape.
  if (videoProvider) insertPayload.video_provider = videoProvider;
  if (videoExternalId) insertPayload.video_external_id = videoExternalId;
  if (videoHash) insertPayload.video_hash = videoHash;
  if (!videoProvider && parsed.data.youtubeVideoId) {
    insertPayload.video_provider = 'youtube';
    insertPayload.video_external_id = parsed.data.youtubeVideoId;
  }

  const { data, error } = await supabase
    .from('lessons')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error || !data) return { error: 'operationFailed' };

  revalidatePath('/admin/courses');
  return { success: true, data: { id: data.id } };
}

export async function updateLesson(id: string, formData: FormData) {
  const { supabase } = await requireAdmin();

  const raw = formDataToObject(formData);

  // Read enough of the current state to cover two concerns:
  //  1. R2 orphan detection when the video source changes.
  //  2. Notification trigger on the false → true publish transition.
  const needsCurrent =
    raw.videoExternalId !== undefined || raw.isPublished !== undefined;
  const currentResult = needsCurrent
    ? await supabase
        .from('lessons')
        .select('video_provider, video_external_id, is_published, module_id')
        .eq('id', id)
        .maybeSingle()
    : { data: null, error: null };
  if (currentResult.error) return { error: 'operationFailed' };
  if (needsCurrent && !currentResult.data) return { error: 'notFound' };
  const current = currentResult.data;

  let orphanedR2Key: string | null = null;
  if (raw.videoExternalId !== undefined && current) {
    const nextProvider = raw.videoProvider || null;
    const nextExternalId = raw.videoExternalId || null;
    const wasR2 =
      current.video_provider === 'r2' && Boolean(current.video_external_id);
    const changed =
      current.video_external_id !== nextExternalId ||
      current.video_provider !== nextProvider;
    if (wasR2 && changed) {
      orphanedR2Key = current.video_external_id as string;
    }
  }

  const becomingPublished =
    raw.isPublished === 'true' && current?.is_published === false;

  const updateObj: Record<string, unknown> = {};
  if (raw.title) updateObj.title = raw.title;
  if (raw.slug) updateObj.slug = raw.slug;
  if (raw.contentType) updateObj.content_type = raw.contentType;
  if (raw.description !== undefined)
    updateObj.description = raw.description || null;
  if (raw.youtubeVideoId !== undefined)
    updateObj.youtube_video_id = raw.youtubeVideoId || null;
  if (raw.textContent !== undefined)
    updateObj.text_content = raw.textContent || null;
  if (raw.durationSeconds)
    updateObj.duration_seconds = parseInt(raw.durationSeconds, 10);
  if (raw.isPublished !== undefined)
    updateObj.is_published = raw.isPublished === 'true';
  if (raw.isFreePreview !== undefined)
    updateObj.is_free_preview = raw.isFreePreview === 'true';

  // Provider-agnostic video fields (Phase C)
  if (raw.videoProvider !== undefined)
    updateObj.video_provider = raw.videoProvider || null;
  if (raw.videoExternalId !== undefined)
    updateObj.video_external_id = raw.videoExternalId || null;
  if (raw.videoHash !== undefined) updateObj.video_hash = raw.videoHash || null;

  // Ebook cover override (empty string clears it, falling back to the
  // script-generated cover).
  if (raw.ebookCoverUrl !== undefined) {
    updateObj.ebook_cover_url = raw.ebookCoverUrl || null;
  }

  updateObj.updated_at = new Date().toISOString();

  const { data: changed, error } = await supabase
    .from('lessons')
    .update(updateObj)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!changed) return { error: 'notFound' };

  if (orphanedR2Key && isR2Configured()) {
    await bulkDeleteObjects([orphanedR2Key]);
  }

  if (becomingPublished) {
    // A published lesson inside an unpublished module is unreachable — the
    // lesson page only resolves lessons through published modules, so it
    // would 404. Publishing a lesson is an explicit intent to make it live,
    // so bring its parent module along. This does NOT expose the module's
    // other draft lessons: each lesson keeps its own is_published flag, so
    // only already-published lessons in the module become visible.
    const moduleId = current?.module_id as string | undefined;
    if (moduleId) {
      const { data: mod, error: moduleError } = await supabase
        .from('modules')
        .select('is_published')
        .eq('id', moduleId)
        .maybeSingle();
      if (moduleError) return { error: 'operationFailed' };
      if (!mod) return { error: 'notFound' };
      if (mod && mod.is_published === false) {
        const { data: publishedModule, error: publishModuleError } =
          await supabase
            .from('modules')
            .update({
              is_published: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', moduleId)
            .select('id')
            .maybeSingle();
        if (publishModuleError) return { error: 'operationFailed' };
        if (!publishedModule) return { error: 'notFound' };
      }
    }

    // Notify only after the module is published, otherwise notifyLessonPublished's
    // own consistency guard would (correctly) suppress the announcement.
    await notifyLessonPublished({ lessonId: id });
  }

  revalidatePath('/admin/courses');
  revalidatePath('/courses');
  return { success: true };
}

export async function deleteLesson(id: string) {
  const { supabase } = await requireAdmin();

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('video_provider, video_external_id')
    .eq('id', id)
    .maybeSingle();
  if (lessonError) return { error: 'operationFailed' };
  if (!lesson) return { error: 'notFound' };
  const r2Key =
    lesson?.video_provider === 'r2' && lesson.video_external_id
      ? lesson.video_external_id
      : null;

  const { data: deleted, error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!deleted) return { error: 'notFound' };

  if (r2Key && isR2Configured()) {
    await bulkDeleteObjects([r2Key]);
  }

  revalidatePath('/admin/courses');
  return { success: true };
}

export async function reorderLessons(moduleId: string, orderedIds: string[]) {
  const { supabase } = await requireAdmin();
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { error: 'invalidInput' };
  }

  const updates = orderedIds.map((id, index) =>
    supabase
      .from('lessons')
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('module_id', moduleId)
      .select('id')
      .maybeSingle(),
  );

  const results = await Promise.all(updates);
  if (results.some((result) => result.error))
    return { error: 'operationFailed' };
  if (results.some((result) => !result.data)) return { error: 'notFound' };

  revalidatePath('/admin/courses');
  return { success: true };
}
