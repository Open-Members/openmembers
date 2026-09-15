import { createAdminClient } from '@/core/supabase/admin';
import { getUserCourseAccess, getUserOwnedCourses } from '@/core/access/server';
import { isR2Configured } from '@/lib/services/r2/client';
import { presignPlayback } from '@/lib/services/r2/presign';
import type { CardCourse } from '@/shared/components/student/CourseCard';
import type {
  RowType,
  ResolvedCollection,
  ContinueItem,
} from './types';

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

type CollectionRow = {
  id: string;
  row_type: RowType;
  title: string;
  subtitle: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_system: boolean;
};

/**
 * Resolves every enabled collection into a `ResolvedCollection[]` ready
 * for the student dashboard. Heavy-lifting queries run in parallel:
 * course catalog + manual picks + progress map + continue-watching.
 */
export async function getEnabledCollections(
  userId: string,
): Promise<ResolvedCollection[]> {
  const supabase = createAdminClient();

  const [collectionsRes, coursesRes, accessSet, ownedSet] = await Promise.all([
    supabase
      .from('collections')
      .select('id, row_type, title, subtitle, sort_order, is_enabled, is_system')
      .eq('is_enabled', true)
      .order('sort_order'),
    supabase
      .from('courses')
      .select(`
        id, slug, title, short_description, thumbnail_url,
        thumbnail_landscape_url, thumbnail_portrait_url,
        duration_minutes, is_new, is_featured, is_free, is_coming_soon, checkout_url,
        trailer_r2_key,
        instructors ( name, portrait_url )
      `)
      .eq('is_published', true)
      .order('sort_order'),
    getUserCourseAccess(userId),
    getUserOwnedCourses(userId),
  ]);

  const collections = (collectionsRes.data ?? []) as CollectionRow[];
  const courses = (coursesRes.data ?? []) as unknown as CourseRow[];
  if (collections.length === 0) return [];

  const [progressMap, manualMap, continueItems, trailerMap] = await Promise.all([
    buildCourseProgressMap(userId, courses.map((c) => c.id)),
    loadManualCollectionCourses(collections),
    loadContinueWatching(userId, 10),
    presignTrailers(courses.map((c) => c.trailer_r2_key)),
  ]);

  const toCard = (c: CourseRow): CardCourse => {
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
      isCompleted:
        isOwned && prog.total > 0 && prog.completed === prog.total,
      checkoutUrl: c.checkout_url,
      trailerUrl: c.trailer_r2_key ? trailerMap.get(c.trailer_r2_key) ?? null : null,
    };
  };

  const byId = new Map(courses.map((c) => [c.id, c]));

  const resolved: ResolvedCollection[] = [];
  for (const col of collections) {
    if (col.row_type === 'continue_watching') {
      if (continueItems.length === 0) continue;
      resolved.push({
        kind: 'continue',
        id: col.id,
        rowType: 'continue_watching',
        title: col.title,
        subtitle: col.subtitle,
        items: continueItems,
      });
      continue;
    }

    let cards: CardCourse[] = [];
    switch (col.row_type) {
      case 'manual': {
        const ids = manualMap.get(col.id) ?? [];
        cards = ids
          .map((id) => byId.get(id))
          .filter((c): c is CourseRow => !!c)
          .map(toCard);
        break;
      }
      case 'enrolled':
        cards = courses.filter((c) => accessSet.has(c.id)).map(toCard);
        break;
      case 'featured':
        cards = courses.filter((c) => c.is_featured).map(toCard);
        break;
      case 'new':
        cards = courses.filter((c) => c.is_new).map(toCard);
        break;
      case 'free':
        cards = courses.filter((c) => c.is_free).map(toCard);
        break;
    }

    if (cards.length === 0) continue; // hide empty rows

    resolved.push({
      kind: 'cards',
      id: col.id,
      rowType: col.row_type,
      title: col.title,
      subtitle: col.subtitle,
      cards,
    });
  }

  return resolved;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function loadManualCollectionCourses(
  collections: CollectionRow[],
): Promise<Map<string, string[]>> {
  const manualIds = collections
    .filter((c) => c.row_type === 'manual')
    .map((c) => c.id);
  if (manualIds.length === 0) return new Map();

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('collection_courses')
    .select('collection_id, course_id, sort_order')
    .in('collection_id', manualIds)
    .order('sort_order');

  const map = new Map<string, string[]>();
  for (const r of data ?? []) {
    const arr = map.get(r.collection_id) ?? [];
    arr.push(r.course_id);
    map.set(r.collection_id, arr);
  }
  return map;
}

async function loadContinueWatching(
  userId: string,
  limit: number,
): Promise<ContinueItem[]> {
  const supabase = createAdminClient();

  const { data: progress } = await supabase
    .from('lesson_progress')
    .select('lesson_id, is_completed, updated_at, video_position_seconds')
    .eq('user_id', userId)
    .eq('is_completed', false)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (!progress?.length) return [];

  const lessonIds = progress.map((p) => p.lesson_id);
  const { data: lessons } = await supabase
    .from('lessons')
    .select(`
      id, slug, title, module_id, duration_seconds,
      modules!inner (
        course_id,
        courses!inner ( slug, title, thumbnail_landscape_url, thumbnail_url )
      )
    `)
    .in('id', lessonIds);

  type LessonRow = {
    id: string;
    slug: string;
    title: string;
    duration_seconds: number | null;
    modules: {
      courses: {
        slug: string;
        title: string;
        thumbnail_landscape_url: string | null;
        thumbnail_url: string | null;
      };
    };
  };

  const lessonMap = new Map(
    ((lessons ?? []) as unknown as LessonRow[]).map((l) => [l.id, l]),
  );

  return progress
    .map((p) => {
      const l = lessonMap.get(p.lesson_id);
      if (!l) return null;
      const course = l.modules?.courses;
      if (!course) return null;
      const total = l.duration_seconds ?? 0;
      const percent =
        total > 0
          ? Math.min(
              100,
              Math.round(((p.video_position_seconds ?? 0) / total) * 100),
            )
          : 0;
      return {
        courseSlug: course.slug,
        lessonSlug: l.slug,
        courseTitle: course.title,
        lessonTitle: l.title,
        thumbnailUrl: course.thumbnail_landscape_url ?? course.thumbnail_url,
        progressPercent: percent,
      };
    })
    .filter((x): x is ContinueItem => x !== null);
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
