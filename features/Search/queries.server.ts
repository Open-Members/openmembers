import { createClient } from '@/core/supabase/server';
import { getUserCourseAccess, isUserLessonAccessible } from '@/core/access/server';
import type { SearchCourseHit, SearchLessonHit, SearchResult } from './types';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const PER_GROUP_LIMIT = 8;

/**
 * Strips characters that would confuse PostgREST's filter syntax (comma
 * separates OR clauses; parens group filters; % and * are wildcards). Keeps
 * letters, digits, whitespace, hyphen, and apostrophe — enough for any
 * realistic title search. Hard-capped so a pasted essay can't blow up the DB.
 */
function sanitize(raw: string): string {
  return raw.trim().replace(/[^\p{L}\p{N}\s\-']/gu, '').slice(0, MAX_QUERY_LENGTH);
}

type LessonEmbed = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  module:
    | {
        course:
          | {
              id: string;
              slug: string;
              title: string;
            }
          | null;
      }
    | null;
};

export async function searchGlobal(
  rawQuery: string,
  userId: string | null,
): Promise<SearchResult> {
  const q = sanitize(rawQuery);
  if (q.length < MIN_QUERY_LENGTH) {
    return { query: rawQuery, courses: [], lessons: [] };
  }

  const supabase = await createClient();
  const accessSet = await getUserCourseAccess(userId);
  const pattern = `%${q}%`;

  const [courseRes, lessonRes] = await Promise.all([
    supabase
      .from('courses')
      .select(
        'id, slug, title, short_description, thumbnail_landscape_url, thumbnail_url',
      )
      .eq('is_published', true)
      .or(`title.ilike.${pattern},short_description.ilike.${pattern}`)
      .limit(PER_GROUP_LIMIT),
    userId ? supabase
      .from('lessons')
      .select(
        `id, slug, title, description,
         module:modules!inner (
           course:courses!inner ( id, slug, title )
         )`,
      )
      .eq('is_published', true)
      .eq('module.is_published', true)
      .eq('module.course.is_published', true)
      .eq('module.course.is_coming_soon', false)
      .or(`title.ilike.${pattern},description.ilike.${pattern}`)
      .limit(PER_GROUP_LIMIT) : Promise.resolve({ data: [], error: null }),
  ]);

  const courses: SearchCourseHit[] = (courseRes.error ? [] : courseRes.data ?? []).map((c) => ({
    kind: 'course',
    id: c.id,
    title: c.title,
    slug: c.slug,
    subtitle: c.short_description,
    thumbnailUrl: c.thumbnail_landscape_url ?? c.thumbnail_url ?? null,
    locked: !accessSet.has(c.id),
    href: `/courses/${c.slug}`,
  }));

  const lessons: SearchLessonHit[] = [];
  // RLS applies the canonical lesson policy before the result limit. Recheck
  // each hit through the shared session-bound gate before returning metadata;
  // course access and a preview flag alone do not authorize lesson disclosure.
  const candidates = (lessonRes.error ? [] : lessonRes.data ?? []) as unknown as LessonEmbed[];
  const decisions = await Promise.all(candidates.map((row) => isUserLessonAccessible(userId, row.id)));
  for (const [index, row] of candidates.entries()) {
    const course = row.module?.course;
    if (!course || !decisions[index]) continue;
    lessons.push({
      kind: 'lesson',
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      courseTitle: course.title,
      courseSlug: course.slug,
      locked: false,
      href: `/courses/${course.slug}/${row.slug}`,
    });
  }

  return { query: rawQuery, courses, lessons, ...(courseRes.error || lessonRes.error ? { error: 'searchFailed' as const } : {}) };
}
