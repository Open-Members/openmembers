import { createClient } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import { getUserCourseAccess, getUserOwnedCourses, isUserLessonAccessible } from '@/core/access/server';
import { getUnlockDates } from '@/features/DripContent/queries';
import { isR2Configured } from '@/lib/services/r2/client';
import { presignPlayback } from '@/lib/services/r2/presign';
import {
  fetchStudentQuizForLesson,
  countUserAttempts,
  hasPassed,
} from '@/features/Quizzes/queries.server';
import type { StudentQuiz } from '@/features/Quizzes/types';
import type { CardCourse } from '@/shared/components/student/CourseCard';
import type {
  CourseWithProgress,
  CourseDetail,
  LessonWithProgress,
  ModuleWithLessonsAndProgress,
} from './types';

// ─── Server-side: Browse catalog ────────────────────────────────────────────
// Returns every published course shaped as CardCourse[], with access +
// progress pre-computed per user. Used by /courses (Browse) and shareable
// with any surface that needs the full catalog.

type CourseRow = {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  thumbnail_url: string | null;
  thumbnail_landscape_url: string | null;
  thumbnail_portrait_url: string | null;
  duration_minutes: number | null;
  is_new: boolean;
  is_featured: boolean;
  is_free: boolean;
  is_coming_soon: boolean;
  checkout_url: string | null;
  trailer_r2_key: string | null;
  instructors: { name: string; portrait_url: string | null } | null;
};

/**
 * Bulk-presign a set of trailer R2 keys → Map<key, signedUrl>. Silently
 * returns an empty map when R2 isn't configured (e.g. local dev without
 * credentials) so catalog pages keep rendering — cards just skip hover
 * previews. Individual presign failures are caught so one bad key doesn't
 * break the whole page.
 */
async function presignTrailers(
  keys: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!isR2Configured()) return map;
  const unique = [...new Set(keys.filter((k): k is string => !!k))];
  if (unique.length === 0) return map;
  const results = await Promise.allSettled(unique.map((k) => presignPlayback(k)));
  for (let i = 0; i < unique.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') map.set(unique[i], r.value);
    else console.error(`[trailer] presign failed for ${unique[i]}:`, r.reason);
  }
  return map;
}

export type BrowseCatalog = {
  all: CardCourse[];
  enrolled: CardCourse[];
  featured: CardCourse[];
  newReleases: CardCourse[];
};

export async function fetchBrowseCatalogServer(
  userId: string,
): Promise<BrowseCatalog> {
  const supabase = createAdminClient();

  const { data: raw } = await supabase
    .from('courses')
    .select(`
      id, slug, title, short_description, thumbnail_url,
      thumbnail_landscape_url, thumbnail_portrait_url,
      duration_minutes, is_new, is_featured, is_free, is_coming_soon, checkout_url,
      trailer_r2_key,
      instructors ( name, portrait_url )
    `)
    .eq('is_published', true)
    .order('sort_order');

  const courses = (raw ?? []) as unknown as CourseRow[];
  const courseIds = courses.map((c) => c.id);

  const [accessSet, ownedSet, progressMap, trailerMap] = await Promise.all([
    getUserCourseAccess(userId),
    getUserOwnedCourses(userId),
    buildCourseProgressMap(userId, courseIds),
    presignTrailers(courses.map((c) => c.trailer_r2_key)),
  ]);

  const all: CardCourse[] = courses.map((c) => {
    const prog = progressMap.get(c.id) ?? { total: 0, completed: 0 };
    const percent =
      prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
    const isComingSoon = c.is_coming_soon;
    // Coming-soon courses can't be entered by anyone, regardless of ownership.
    const isAccessible = !isComingSoon && accessSet.has(c.id);
    const isOwned = !isComingSoon && ownedSet.has(c.id);
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      shortDescription: c.short_description,
      thumbnailLandscapeUrl: c.thumbnail_landscape_url ?? c.thumbnail_url,
      thumbnailPortraitUrl: c.thumbnail_portrait_url,
      instructorName: c.instructors?.name ?? null,
      instructorPortraitUrl: c.instructors?.portrait_url ?? null,
      durationMinutes: c.duration_minutes,
      isNew: c.is_new,
      isFeatured: c.is_featured,
      isFree: c.is_free,
      isComingSoon,
      isAccessible,
      isOwned,
      progressPercent: isOwned ? percent : 0,
      isCompleted: isOwned && prog.total > 0 && prog.completed === prog.total,
      checkoutUrl: c.checkout_url,
      trailerUrl: c.trailer_r2_key ? trailerMap.get(c.trailer_r2_key) ?? null : null,
    };
  });

  // Owned courses surface first; locked ones follow. Within each group we
  // preserve the admin-defined sort_order (the source order from the query).
  const allSorted = [
    ...all.filter((c) => c.isOwned),
    ...all.filter((c) => !c.isOwned),
  ];

  return {
    all: allSorted,
    enrolled: allSorted.filter((c) => c.isOwned),
    featured: allSorted.filter((c) => c.isFeatured),
    newReleases: allSorted.filter((c) => c.isNew),
  };
}

async function buildCourseProgressMap(
  userId: string,
  courseIds: string[],
): Promise<Map<string, { total: number; completed: number }>> {
  const map = new Map<string, { total: number; completed: number }>();
  if (courseIds.length === 0) return map;

  const supabase = createAdminClient();

  const { data: modules } = await supabase
    .from('modules')
    .select('id, course_id')
    .in('course_id', courseIds)
    .eq('is_published', true);

  const moduleIdToCourse = new Map<string, string>();
  for (const m of modules ?? []) moduleIdToCourse.set(m.id, m.course_id);

  const moduleIds = [...moduleIdToCourse.keys()];
  if (moduleIds.length === 0) return map;

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, module_id')
    .in('module_id', moduleIds)
    .eq('is_published', true);

  const lessonIdToCourse = new Map<string, string>();
  for (const l of lessons ?? []) {
    const cid = moduleIdToCourse.get(l.module_id);
    if (cid) lessonIdToCourse.set(l.id, cid);
  }

  for (const cid of lessonIdToCourse.values()) {
    const cur = map.get(cid) ?? { total: 0, completed: 0 };
    cur.total += 1;
    map.set(cid, cur);
  }

  const lessonIds = [...lessonIdToCourse.keys()];
  if (lessonIds.length === 0) return map;

  const { data: completed } = await supabase
    .from('lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('is_completed', true)
    .in('lesson_id', lessonIds);

  for (const c of completed ?? []) {
    const cid = lessonIdToCourse.get(c.lesson_id);
    if (!cid) continue;
    const cur = map.get(cid) ?? { total: 0, completed: 0 };
    cur.completed += 1;
    map.set(cid, cur);
  }

  return map;
}

// ─── Server-side: Course detail (student view) ─────────────────────────────
// Used by /courses/[slug]. Works for both enrolled and locked users — the
// `isAccessible` flag controls UI gating downstream.

export type CourseDetailView = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  heroBannerUrl: string | null;
  heroOverlayOpacity: number;
  heroShowText: boolean;
  thumbnailLandscapeUrl: string | null;
  thumbnailPortraitUrl: string | null;
  trailerYoutubeId: string | null;
  durationMinutes: number | null;
  isNew: boolean;
  isFeatured: boolean;
  contentFormat: 'video' | 'ebook';

  isAccessible: boolean;
  checkoutUrl: string | null;

  /** Certificate is configured on both tenant + course — show download button
   *  when the user also has isCompleted. */
  certificateAvailable: boolean;

  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  isCompleted: boolean;
  firstLessonSlug: string | null;
  resumeLessonSlug: string | null;

  modules: Array<{
    id: string;
    title: string;
    description: string | null;
    lessons: Array<{
      id: string;
      slug: string;
      title: string;
      durationSeconds: number | null;
      isCompleted: boolean;
      isDripLocked: boolean;
      dripUnlockDate: string | null;
      isFreePreview: boolean;
      /** Public URL of the ebook cover (only set when contentFormat='ebook').
       *  Admin override (lessons.ebook_cover_url) wins; otherwise defaults to
       *  the script-rendered PNG at platform-assets/ebook-covers/<id>.png. */
      coverUrl: string | null;
    }>;
  }>;

  instructor: {
    id: string;
    slug: string;
    name: string;
    headline: string | null;
    portraitUrl: string | null;
    bio: string | null;
  } | null;

  related: CardCourse[];
};

export async function fetchCourseDetailServer(
  slug: string,
  userId: string,
): Promise<CourseDetailView | null> {
  const supabase = createAdminClient();

  // Course + instructor
  const { data: course } = await supabase
    .from('courses')
    .select(`
      id, slug, title, description, short_description,
      thumbnail_url, thumbnail_landscape_url, thumbnail_portrait_url,
      hero_banner_url, hero_overlay_opacity, hero_show_text, trailer_youtube_id,
      duration_minutes, is_new, is_featured, is_free, checkout_url, instructor_id,
      certificate_enabled, content_format,
      instructors (
        id, slug, name, headline, portrait_url, bio
      )
    `)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (!course) return null;

  // Fan out the remaining queries in parallel.
  const [modulesRes, accessSet, unlockMap, relatedRaw, tenantRes] = await Promise.all([
    loadModulesAndLessons(course.id, userId),
    getUserCourseAccess(userId),
    // Drip only meaningful for accessible users; still cheap enough to always call.
    getUnlockDates(userId, course.id),
    loadRelatedCourseRows(course.id, course.instructor_id),
    supabase
      .from('tenant_settings')
      .select('certificate_enabled')
      .limit(1)
      .maybeSingle(),
  ]);

  const certificateAvailable =
    !!course.certificate_enabled && !!tenantRes.data?.certificate_enabled;

  const isAccessible = accessSet.has(course.id);
  const contentFormat = ((course.content_format ?? 'video') as 'video' | 'ebook');

  // Ebook covers: an admin-uploaded override (lessons.ebook_cover_url) wins;
  // otherwise we fall through to a deterministic path keyed by lesson id, which
  // is where scripts/ebook-covers-render.mjs writes the auto-generated PNG.
  const COVER_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/platform-assets/ebook-covers`;
  const coverUrlFor = (lesson: { id: string; ebook_cover_url: string | null }) =>
    contentFormat === 'ebook'
      ? lesson.ebook_cover_url || `${COVER_BASE}/${lesson.id}.png`
      : null;

  const { modules, lessonProgress, firstLessonSlug, resumeLessonSlug, totalLessons, completedLessons } =
    modulesRes;

  const progressPercent =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // Build the `modules` view with drip + progress merged in.
  const modulesView: CourseDetailView['modules'] = modules.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    lessons: m.lessons.map((l) => {
      const unlock = unlockMap.get(l.id);
      const isDripLocked = isAccessible && unlock ? !unlock.unlocked : false;
      return {
        id: l.id,
        slug: l.slug,
        title: l.title,
        durationSeconds: l.duration_seconds ?? null,
        isCompleted: lessonProgress.get(l.id)?.is_completed ?? false,
        isDripLocked,
        dripUnlockDate: unlock?.unlocksAt ? unlock.unlocksAt.toISOString() : null,
        isFreePreview: l.is_free_preview,
        coverUrl: coverUrlFor(l),
      };
    }),
  }));

  // Related courses
  const related = await hydrateRelatedCards(relatedRaw, userId);

  // Supabase types the joined row loosely; narrow defensively.
  const instructorRaw = course.instructors as unknown as
    | {
        id: string;
        slug: string;
        name: string;
        headline: string | null;
        portrait_url: string | null;
        bio: string | null;
      }
    | null;
  const instructor = instructorRaw
    ? {
        id: instructorRaw.id,
        slug: instructorRaw.slug,
        name: instructorRaw.name,
        headline: instructorRaw.headline,
        portraitUrl: instructorRaw.portrait_url,
        bio: instructorRaw.bio,
      }
    : null;

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    shortDescription: course.short_description,
    description: course.description,
    heroBannerUrl: course.hero_banner_url,
    heroOverlayOpacity: course.hero_overlay_opacity ?? 70,
    heroShowText: course.hero_show_text ?? true,
    thumbnailLandscapeUrl: course.thumbnail_landscape_url ?? course.thumbnail_url,
    thumbnailPortraitUrl: course.thumbnail_portrait_url,
    trailerYoutubeId: course.trailer_youtube_id,
    durationMinutes: course.duration_minutes,
    isNew: course.is_new,
    isFeatured: course.is_featured,
    contentFormat,

    isAccessible,
    checkoutUrl: course.checkout_url,
    certificateAvailable,

    totalLessons,
    completedLessons,
    progressPercent,
    isCompleted: totalLessons > 0 && completedLessons === totalLessons,
    firstLessonSlug,
    resumeLessonSlug,

    modules: modulesView,
    instructor,
    related,
  };
}

async function loadModulesAndLessons(courseId: string, userId: string) {
  const supabase = createAdminClient();

  const { data: modules } = await supabase
    .from('modules')
    .select('id, title, description, sort_order')
    .eq('course_id', courseId)
    .eq('is_published', true)
    .order('sort_order');

  const moduleIds = (modules ?? []).map((m) => m.id);

  type LessonRow = {
    id: string;
    slug: string;
    title: string;
    module_id: string;
    duration_seconds: number | null;
    sort_order: number;
    is_free_preview: boolean;
    ebook_cover_url: string | null;
  };

  const { data: lessonsRaw } = moduleIds.length
    ? await supabase
        .from('lessons')
        .select('id, slug, title, module_id, duration_seconds, sort_order, is_free_preview, ebook_cover_url')
        .in('module_id', moduleIds)
        .eq('is_published', true)
        .order('sort_order')
    : { data: [] as LessonRow[] };

  const lessons = (lessonsRaw ?? []) as LessonRow[];
  const lessonIds = lessons.map((l) => l.id);

  const { data: progressRows } = lessonIds.length
    ? await supabase
        .from('lesson_progress')
        .select('lesson_id, is_completed, updated_at')
        .eq('user_id', userId)
        .in('lesson_id', lessonIds)
    : { data: [] };

  const lessonProgress = new Map(
    (progressRows ?? []).map((p) => [p.lesson_id, p]),
  );

  // Group lessons by module.
  const lessonsByModule = new Map<string, LessonRow[]>();
  for (const l of lessons) {
    const arr = lessonsByModule.get(l.module_id) ?? [];
    arr.push(l);
    lessonsByModule.set(l.module_id, arr);
  }

  const modulesWithLessons = (modules ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    sortOrder: m.sort_order,
    lessons: (lessonsByModule.get(m.id) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  }));

  // Flattened ordered list (for first + resume logic).
  const flat = modulesWithLessons.flatMap((m) => m.lessons);
  const firstLessonSlug = flat[0]?.slug ?? null;

  // Resume = most recent non-completed progress row for any of this course's lessons.
  let resumeLessonSlug: string | null = null;
  let latestNonCompleted: { lesson_id: string; updated_at: string } | null = null;
  for (const p of progressRows ?? []) {
    if (p.is_completed) continue;
    if (!latestNonCompleted || p.updated_at > latestNonCompleted.updated_at) {
      latestNonCompleted = p;
    }
  }
  if (latestNonCompleted) {
    const lesson = flat.find((l) => l.id === latestNonCompleted!.lesson_id);
    if (lesson) resumeLessonSlug = lesson.slug;
  }
  resumeLessonSlug = resumeLessonSlug ?? firstLessonSlug;

  const totalLessons = flat.length;
  const completedLessons = (progressRows ?? []).filter((p) => p.is_completed).length;

  return {
    modules: modulesWithLessons,
    lessonProgress,
    firstLessonSlug,
    resumeLessonSlug,
    totalLessons,
    completedLessons,
  };
}

async function loadRelatedCourseRows(
  currentCourseId: string,
  instructorId: string | null,
): Promise<CourseRow[]> {
  const supabase = createAdminClient();
  const target = 6;

  const seen = new Set<string>([currentCourseId]);
  const collected: CourseRow[] = [];

  const push = (rows: CourseRow[]) => {
    for (const r of rows) {
      if (collected.length >= target) return;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      collected.push(r);
    }
  };

  // 1) Same instructor
  if (instructorId) {
    const { data } = await supabase
      .from('courses')
      .select(`
        id, slug, title, short_description, thumbnail_url,
        thumbnail_landscape_url, thumbnail_portrait_url,
        duration_minutes, is_new, is_featured, is_free, is_coming_soon, checkout_url,
        trailer_r2_key,
        instructors ( name, portrait_url )
      `)
      .eq('is_published', true)
      .eq('instructor_id', instructorId)
      .neq('id', currentCourseId)
      .order('sort_order')
      .limit(target);
    push((data ?? []) as unknown as CourseRow[]);
  }

  // 2) Featured, excluding already seen
  if (collected.length < target) {
    const { data } = await supabase
      .from('courses')
      .select(`
        id, slug, title, short_description, thumbnail_url,
        thumbnail_landscape_url, thumbnail_portrait_url,
        duration_minutes, is_new, is_featured, is_free, is_coming_soon, checkout_url,
        trailer_r2_key,
        instructors ( name, portrait_url )
      `)
      .eq('is_published', true)
      .eq('is_featured', true)
      .order('sort_order')
      .limit(target + 1);
    push((data ?? []) as unknown as CourseRow[]);
  }

  // 3) Any published, excluding already seen
  if (collected.length < target) {
    const { data } = await supabase
      .from('courses')
      .select(`
        id, slug, title, short_description, thumbnail_url,
        thumbnail_landscape_url, thumbnail_portrait_url,
        duration_minutes, is_new, is_featured, is_free, is_coming_soon, checkout_url,
        trailer_r2_key,
        instructors ( name, portrait_url )
      `)
      .eq('is_published', true)
      .order('sort_order')
      .limit(target + 5);
    push((data ?? []) as unknown as CourseRow[]);
  }

  return collected;
}

async function hydrateRelatedCards(
  rows: CourseRow[],
  userId: string,
): Promise<CardCourse[]> {
  if (rows.length === 0) return [];

  const [accessSet, ownedSet, progressMap, trailerMap] = await Promise.all([
    getUserCourseAccess(userId),
    getUserOwnedCourses(userId),
    buildCourseProgressMap(userId, rows.map((r) => r.id)),
    presignTrailers(rows.map((r) => r.trailer_r2_key)),
  ]);

  return rows.map((c) => {
    const prog = progressMap.get(c.id) ?? { total: 0, completed: 0 };
    const percent =
      prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
    const isComingSoon = c.is_coming_soon;
    const isAccessible = !isComingSoon && accessSet.has(c.id);
    const isOwned = !isComingSoon && ownedSet.has(c.id);
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      shortDescription: c.short_description,
      thumbnailLandscapeUrl: c.thumbnail_landscape_url ?? c.thumbnail_url,
      thumbnailPortraitUrl: c.thumbnail_portrait_url,
      instructorName: c.instructors?.name ?? null,
      instructorPortraitUrl: c.instructors?.portrait_url ?? null,
      durationMinutes: c.duration_minutes,
      isNew: c.is_new,
      isFeatured: c.is_featured,
      isFree: c.is_free,
      isComingSoon,
      isAccessible,
      isOwned,
      progressPercent: isOwned ? percent : 0,
      isCompleted: isOwned && prog.total > 0 && prog.completed === prog.total,
      checkoutUrl: c.checkout_url,
      trailerUrl: c.trailer_r2_key ? trailerMap.get(c.trailer_r2_key) ?? null : null,
    };
  });
}

// ─── Server-side: Enrolled courses with progress ────────────────────────────

export async function fetchEnrolledCoursesServer(userId: string): Promise<CourseWithProgress[]> {
  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('access_level_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  if (!enrollments?.length) return [];

  const accessLevelIds = enrollments.map(e => e.access_level_id);

  const { data: accessLevelCourses } = await supabase
    .from('access_level_courses')
    .select('course_id')
    .in('access_level_id', accessLevelIds);

  if (!accessLevelCourses?.length) return [];

  const courseIds = [...new Set(accessLevelCourses.map(a => a.course_id))];

  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .in('id', courseIds)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  if (!courses?.length) return [];

  const results: CourseWithProgress[] = [];

  for (const course of courses) {
    const { data: modules } = await supabase
      .from('modules')
      .select('id, sort_order')
      .eq('course_id', course.id)
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    const moduleIds = (modules ?? []).map(m => m.id);

    let totalLessons = 0;
    let completedLessons = 0;
    let resumeLessonSlug: string | null = null;

    if (moduleIds.length > 0) {
      // Pull every published lesson for this course in its natural order.
      // We need id (to join against progress), slug (for the resume link),
      // and module_id+sort_order (to fall back to "first lesson").
      const { data: lessonRows } = await supabase
        .from('lessons')
        .select('id, slug, module_id, sort_order')
        .in('module_id', moduleIds)
        .eq('is_published', true);

      const lessons = (lessonRows ?? []) as Array<{
        id: string;
        slug: string;
        module_id: string;
        sort_order: number;
      }>;

      totalLessons = lessons.length;

      if (lessons.length > 0) {
        // Order lessons by their module's sort_order, then the lesson's sort_order.
        const moduleOrder = new Map<string, number>();
        for (const m of modules ?? []) moduleOrder.set(m.id, m.sort_order);
        const orderedLessons = [...lessons].sort((a, b) => {
          const ma = moduleOrder.get(a.module_id) ?? 0;
          const mb = moduleOrder.get(b.module_id) ?? 0;
          if (ma !== mb) return ma - mb;
          return a.sort_order - b.sort_order;
        });
        const firstLessonSlug = orderedLessons[0]?.slug ?? null;

        const lessonIds = lessons.map(l => l.id);
        const slugById = new Map(lessons.map(l => [l.id, l.slug]));

        // Grab progress rows for this user across this course's lessons in a
        // single round-trip; we need both the completion count and the most
        // recent non-completed row for the resume target.
        const { data: progressRows } = await supabase
          .from('lesson_progress')
          .select('lesson_id, is_completed, updated_at')
          .eq('user_id', userId)
          .in('lesson_id', lessonIds);

        completedLessons = (progressRows ?? []).filter(p => p.is_completed).length;

        let latestNonCompleted: { lesson_id: string; updated_at: string } | null = null;
        for (const p of progressRows ?? []) {
          if (p.is_completed) continue;
          if (!latestNonCompleted || p.updated_at > latestNonCompleted.updated_at) {
            latestNonCompleted = p;
          }
        }

        resumeLessonSlug =
          (latestNonCompleted && slugById.get(latestNonCompleted.lesson_id)) ??
          firstLessonSlug;
      }
    }

    results.push({
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description ?? undefined,
      // Prefer landscape; card slot is 16:9. Fall back to square/portrait.
      thumbnailUrl:
        course.thumbnail_landscape_url ??
        course.thumbnail_url ??
        course.thumbnail_portrait_url ??
        undefined,
      isPublished: course.is_published,
      sortOrder: course.sort_order,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
      totalLessons,
      completedLessons,
      progressPercent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      resumeLessonSlug,
    });
  }

  return results;
}

// ─── Server-side: Course detail with modules, lessons, and progress ─────────

export async function fetchCourseBySlugServer(slug: string, userId: string): Promise<CourseDetail | null> {
  const supabase = await createClient();

  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  if (!course) return null;

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

  const { data: lessons } = await supabase
    .from('lessons')
    .select('*')
    .in('module_id', moduleIds)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  const allLessonIds = (lessons ?? []).map(l => l.id);

  const { data: progressRows } = allLessonIds.length > 0
    ? await supabase
        .from('lesson_progress')
        .select('*')
        .eq('user_id', userId)
        .in('lesson_id', allLessonIds)
    : { data: [] };

  const progressMap = new Map((progressRows ?? []).map(p => [p.lesson_id, p]));

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
        videoProvider: (lesson.video_provider ?? undefined) as 'youtube' | 'vimeo' | 'r2' | undefined,
        videoExternalId: lesson.video_external_id ?? undefined,
        videoHash: lesson.video_hash ?? undefined,
        description: lesson.description ?? undefined,
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

// ─── Server-side: Lesson by slug within a course ────────────────────────────

export async function fetchLessonBySlugServer(
  courseSlug: string,
  lessonSlug: string,
  userId: string,
): Promise<{
  lesson: LessonWithProgress;
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnailLandscapeUrl: string | null;
    thumbnailPortraitUrl: string | null;
    heroBannerUrl: string | null;
    contentFormat: 'video' | 'ebook';
  };
  modules: ModuleWithLessonsAndProgress[];
  prevLesson: { slug: string; title: string } | null;
  nextLesson: { slug: string; title: string } | null;
  // Phase B4 additions
  isAccessible: boolean;
  isFreePreview: boolean;
  isDripLocked: boolean;
  dripUnlockDate: string | null;
  autoplayNextLesson: boolean;
  /** Only populated when lesson.content_type === 'quiz'. */
  quiz: StudentQuiz | null;
  quizAttemptsUsed: number;
  quizAlreadyPassed: boolean;
} | null> {
  const supabase = await createClient();

  // Get the course
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', courseSlug)
    .eq('is_published', true)
    .single();

  if (!course) return null;

  // Get all modules and lessons for the course
  const { data: modules } = await supabase
    .from('modules')
    .select('*')
    .eq('course_id', course.id)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  if (!modules?.length) return null;

  const moduleIds = modules.map(m => m.id);

  const { data: lessons } = await supabase
    .from('lessons')
    .select('*')
    .in('module_id', moduleIds)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  if (!lessons?.length) return null;

  // Find the target lesson
  const targetLesson = lessons.find(l => l.slug === lessonSlug);
  if (!targetLesson || !(await isUserLessonAccessible(userId, targetLesson.id))) return null;

  // Fetch progress for all lessons
  const allLessonIds = lessons.map(l => l.id);
  const { data: progressRows } = await supabase
    .from('lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .in('lesson_id', allLessonIds);

  const progressMap = new Map((progressRows ?? []).map(p => [p.lesson_id, p]));

  // Fetch attachments for the target lesson
  const { data: attachments } = await supabase
    .from('lesson_attachments')
    .select('*')
    .eq('lesson_id', targetLesson.id)
    .order('sort_order', { ascending: true });

  // Build flat ordered list for prev/next navigation
  const flatLessons: Array<{ slug: string; title: string; moduleId: string }> = [];
  for (const mod of modules) {
    const modLessons = lessons.filter(l => l.module_id === mod.id);
    for (const l of modLessons) {
      flatLessons.push({ slug: l.slug, title: l.title, moduleId: l.module_id });
    }
  }

  const currentIndex = flatLessons.findIndex(l => l.slug === lessonSlug);
  const prevLesson = currentIndex > 0 ? flatLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < flatLessons.length - 1 ? flatLessons[currentIndex + 1] : null;

  // Build modules with progress for sidebar
  const modulesWithProgress: ModuleWithLessonsAndProgress[] = modules.map(mod => {
    const moduleLessons = lessons.filter(l => l.module_id === mod.id);
    return {
      id: mod.id,
      courseId: mod.course_id,
      title: mod.title,
      description: mod.description ?? undefined,
      sortOrder: mod.sort_order,
      isPublished: mod.is_published,
      lessons: moduleLessons.map(lesson => {
        const prog = progressMap.get(lesson.id);
        return {
          id: lesson.id,
          moduleId: lesson.module_id,
          title: lesson.title,
          slug: lesson.slug,
          contentType: lesson.content_type as 'video' | 'text' | 'quiz',
          description: lesson.description ?? undefined,
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
          attachments: [],
        };
      }),
    };
  });

  // Build the target lesson with progress and attachments
  const prog = progressMap.get(targetLesson.id);
  const lessonWithProgress: LessonWithProgress = {
    id: targetLesson.id,
    moduleId: targetLesson.module_id,
    title: targetLesson.title,
    slug: targetLesson.slug,
    contentType: targetLesson.content_type as 'video' | 'text' | 'quiz',
    youtubeVideoId: targetLesson.youtube_video_id ?? undefined,
    videoProvider: (targetLesson.video_provider ?? undefined) as 'youtube' | 'vimeo' | 'r2' | undefined,
    videoExternalId: targetLesson.video_external_id ?? undefined,
    videoHash: targetLesson.video_hash ?? undefined,
    description: targetLesson.description ?? undefined,
    textContent: targetLesson.text_content ?? undefined,
    durationSeconds: targetLesson.duration_seconds ?? undefined,
    sortOrder: targetLesson.sort_order,
    isPublished: targetLesson.is_published,
    isFreePreview: targetLesson.is_free_preview,
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

  // ── Phase B4: access / drip / autoplay preference ───────────────────────
  const [accessSet, unlockMap, profileRes] = await Promise.all([
    getUserCourseAccess(userId),
    getUnlockDates(userId, course.id),
    supabase
      .from('profiles')
      .select('autoplay_next_lesson')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  const isAccessible = accessSet.has(course.id);
  const isFreePreview = targetLesson.is_free_preview;
  const dripState = unlockMap.get(targetLesson.id);
  const isDripLocked = isAccessible && dripState ? !dripState.unlocked : false;
  const dripUnlockDate = dripState?.unlocksAt?.toISOString() ?? null;
  const autoplayNextLesson =
    profileRes.data?.autoplay_next_lesson ?? false;

  // Quiz payload (only meaningful for content_type='quiz' lessons).
  let quiz: StudentQuiz | null = null;
  let quizAttemptsUsed = 0;
  let quizAlreadyPassed = false;
  if (targetLesson.content_type === 'quiz') {
    quiz = await fetchStudentQuizForLesson(targetLesson.id);
    if (quiz) {
      [quizAttemptsUsed, quizAlreadyPassed] = await Promise.all([
        countUserAttempts(userId, quiz.id),
        hasPassed(userId, quiz.id),
      ]);
    }
  }

  return {
    lesson: lessonWithProgress,
    course: {
      id: course.id,
      title: course.title,
      slug: course.slug,
      thumbnailLandscapeUrl:
        course.thumbnail_landscape_url ?? course.thumbnail_url ?? null,
      thumbnailPortraitUrl: course.thumbnail_portrait_url ?? null,
      heroBannerUrl: course.hero_banner_url ?? null,
      contentFormat: ((course.content_format ?? 'video') as 'video' | 'ebook'),
    },
    modules: modulesWithProgress,
    prevLesson,
    nextLesson,
    isAccessible,
    isFreePreview,
    isDripLocked,
    dripUnlockDate,
    autoplayNextLesson,
    quiz,
    quizAttemptsUsed,
    quizAlreadyPassed,
  };
}
