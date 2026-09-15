import { createAdminClient } from '@/core/supabase/admin';
import { createClient } from '@/core/supabase/server';
import { getUserCourseAccess } from '@/core/access/server';
import type {
  LiveClass,
  LiveClassCourseLink,
  LiveClassWithCourse,
  UpcomingLiveClass,
} from './types';

type Row = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
  meeting_url: string;
  origin_timezone: string;
  created_at: string;
  updated_at: string;
  live_class_courses?: Array<{
    courses: { id: string; title: string; slug: string } | null;
  }> | null;
};

function rowToLiveClass(r: Row): LiveClass {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: r.starts_at,
    durationMinutes: r.duration_minutes,
    meetingUrl: r.meeting_url,
    originTimezone: r.origin_timezone,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function extractCourses(r: Row): LiveClassCourseLink[] {
  const links = r.live_class_courses ?? [];
  const out: LiveClassCourseLink[] = [];
  for (const link of links) {
    if (!link.courses) continue;
    out.push({
      id: link.courses.id,
      title: link.courses.title,
      slug: link.courses.slug,
    });
  }
  // Stable ordering — alphabetical so the "first" compat course is
  // deterministic across requests.
  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

function rowToWithCourses(r: Row): LiveClassWithCourse {
  const base = rowToLiveClass(r);
  const courses = extractCourses(r);
  const first = courses[0];
  return {
    ...base,
    courses,
    courseId: first?.id ?? '',
    courseTitle: first?.title ?? '',
    courseSlug: first?.slug ?? '',
  };
}

const SELECT_WITH_COURSES = '*, live_class_courses(courses(id, title, slug))';
const SELECT_ACCESSIBLE_COURSES =
  '*, live_class_courses!inner(course_id, courses(id, title, slug))';

/** Admin: list everything, upcoming first, then past. */
export async function listAllLiveClasses(): Promise<LiveClassWithCourse[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('live_classes')
    .select(SELECT_WITH_COURSES)
    .order('starts_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToWithCourses(r as Row));
}

/**
 * Dashboard banner query — finds the soonest live class the user is eligible
 * for that is either already running or starting within `horizonHours`.
 * Course access and the final event query both enforce session authorization.
 */
export async function findUpcomingLiveClassForUser(
  userId: string,
  opts: { horizonHours?: number; now?: Date } = {},
): Promise<UpcomingLiveClass | null> {
  const horizonHours = opts.horizonHours ?? 48;
  const now = opts.now ?? new Date();
  const courseIds = [...(await getUserCourseAccess(userId))];
  if (courseIds.length === 0) return null;
  const session = await createClient();

  const windowStartISO = new Date(
    now.getTime() - 6 * 60 * 60_000,
  ).toISOString();
  const windowEndISO = new Date(
    now.getTime() + horizonHours * 60 * 60_000,
  ).toISOString();

  const { data, error } = await session
    .from('live_classes')
    .select(SELECT_ACCESSIBLE_COURSES)
    .in('live_class_courses.course_id', courseIds)
    .gte('starts_at', windowStartISO)
    .lte('starts_at', windowEndISO)
    .order('starts_at', { ascending: true })
    .limit(5);
  if (error) throw error;

  const nowMs = now.getTime();
  for (const row of (data ?? []) as Row[]) {
    const startMs = new Date(row.starts_at).getTime();
    const endMs = startMs + row.duration_minutes * 60_000;
    if (endMs <= nowMs) continue;
    const base = rowToWithCourses(row);
    // When the user is enrolled in only some of the linked courses, prefer
    // one of *their* courses as the display primary so the banner doesn't
    // advertise a course they can't see.
    const visibleCourses = base.courses.filter((c) => courseIds.includes(c.id));
    if (!visibleCourses.length) continue;
    const displayCourses = visibleCourses;
    return {
      ...base,
      courses: displayCourses,
      courseId: displayCourses[0]?.id ?? base.courseId,
      courseTitle: displayCourses[0]?.title ?? base.courseTitle,
      courseSlug: displayCourses[0]?.slug ?? base.courseSlug,
      msUntilStart: startMs - nowMs,
      isLive: startMs <= nowMs && nowMs < endMs,
    };
  }
  return null;
}

/**
 * Calendar view — every live class the user is eligible for inside the given
 * ISO date window. Used by the Progress page calendar so the client can
 * filter by visible month without re-fetching on navigation.
 */
export async function listLiveClassesForUser(
  userId: string,
  range: { fromIso: string; toIso: string },
): Promise<LiveClassWithCourse[]> {
  const courseIds = [...(await getUserCourseAccess(userId))];
  if (courseIds.length === 0) return [];
  const session = await createClient();

  const { data, error } = await session
    .from('live_classes')
    .select(SELECT_ACCESSIBLE_COURSES)
    .in('live_class_courses.course_id', courseIds)
    .gte('starts_at', range.fromIso)
    .lte('starts_at', range.toIso)
    .order('starts_at', { ascending: true });
  if (error) throw error;

  // Hide course badges the user isn't enrolled in — they shouldn't learn
  // about co-enrolled audiences from the calendar.
  const userCourseSet = new Set(courseIds);
  return ((data ?? []) as Row[]).flatMap((r) => {
    const base = rowToWithCourses(r);
    const visible = base.courses.filter((c) => userCourseSet.has(c.id));
    if (!visible.length) return [];
    const ordered = visible;
    const first = ordered[0];
    return {
      ...base,
      courses: ordered,
      courseId: first?.id ?? base.courseId,
      courseTitle: first?.title ?? base.courseTitle,
      courseSlug: first?.slug ?? base.courseSlug,
    };
  });
}

/* ─── Admin CRUD ─────────────────────────────────────────────────────
   Service-role so they don't depend on the session. Course links are
   replaced in explicit delete/insert steps. Callers report a failed step and
   do not claim transaction-level atomicity for this composite edit. */

type CrudInput = {
  courseIds: string[];
  title: string;
  description: string | null;
  /** Already-normalized UTC ISO. */
  startsAt: string;
  durationMinutes: number;
  meetingUrl: string;
  originTimezone: string;
};

export async function createLiveClass(input: CrudInput): Promise<void> {
  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from('live_classes')
    .insert({
      title: input.title,
      description: input.description,
      starts_at: input.startsAt,
      duration_minutes: input.durationMinutes,
      meeting_url: input.meetingUrl,
      origin_timezone: input.originTimezone,
    })
    .select('id')
    .single();
  if (error) throw error;

  if (input.courseIds.length > 0) {
    const links = input.courseIds.map((cid) => ({
      live_class_id: inserted.id,
      course_id: cid,
    }));
    const { data: insertedLinks, error: linkErr } = await admin
      .from('live_class_courses')
      .insert(links)
      .select('live_class_id');
    if (linkErr || insertedLinks?.length !== links.length) {
      // Best-effort compensation; this is not presented as a transaction.
      await admin.from('live_classes').delete().eq('id', inserted.id);
      throw linkErr ?? new Error('liveClassLinksNotConfirmed');
    }
  }
}

export async function updateLiveClass(
  id: string,
  input: CrudInput,
): Promise<void> {
  const admin = createAdminClient();

  const { data: existingLinks, error: linksReadError } = await admin
    .from('live_class_courses')
    .select('course_id')
    .eq('live_class_id', id);
  if (linksReadError) throw linksReadError;

  const { data: changed, error } = await admin
    .from('live_classes')
    .update({
      title: input.title,
      description: input.description,
      starts_at: input.startsAt,
      duration_minutes: input.durationMinutes,
      meeting_url: input.meetingUrl,
      origin_timezone: input.originTimezone,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!changed) throw new Error('notFound');

  // Add desired links before removing stale ones. This remains a sequence of
  // confirmed writes rather than a transaction, but an insert failure keeps
  // every previously saved association.
  if (input.courseIds.length > 0) {
    const links = input.courseIds.map((cid) => ({
      live_class_id: id,
      course_id: cid,
    }));
    const { data: upsertedLinks, error: linkErr } = await admin
      .from('live_class_courses')
      .upsert(links, { onConflict: 'live_class_id,course_id' })
      .select('course_id');
    if (linkErr || upsertedLinks?.length !== links.length) {
      throw linkErr ?? new Error('liveClassLinksNotConfirmed');
    }
  }

  const desiredIds = new Set(input.courseIds);
  const removedIds = (existingLinks ?? [])
    .map((link) => link.course_id)
    .filter((courseId) => !desiredIds.has(courseId));
  if (removedIds.length > 0) {
    const { data: removedLinks, error: removeError } = await admin
      .from('live_class_courses')
      .delete()
      .eq('live_class_id', id)
      .in('course_id', removedIds)
      .select('course_id');
    if (removeError || removedLinks?.length !== removedIds.length) {
      throw removeError ?? new Error('liveClassLinksNotConfirmed');
    }
  }

  const { data: confirmedLinks, error: confirmError } = await admin
    .from('live_class_courses')
    .select('course_id')
    .eq('live_class_id', id);
  if (
    confirmError ||
    !confirmedLinks ||
    confirmedLinks.length !== desiredIds.size ||
    confirmedLinks.some((link) => !desiredIds.has(link.course_id))
  ) {
    throw confirmError ?? new Error('liveClassLinksNotConfirmed');
  }
}

export async function deleteLiveClass(id: string): Promise<void> {
  const admin = createAdminClient();
  const { data: deleted, error } = await admin
    .from('live_classes')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!deleted) throw new Error('notFound');
}
