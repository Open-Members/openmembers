'use server';

import { requireAdmin } from '@/core/access/admin';
import { createNotifications } from '@/core/notifications/service';
import { normalizePublicUrl } from '@/core/security/public-url';
import { createAdminClient } from '@/core/supabase/admin';

export type BroadcastAudience =
  | { kind: 'all' }
  | { kind: 'access_level'; id: string }
  | { kind: 'course'; id: string };

export type BroadcastInput = {
  requestId: string;
  title: string;
  message: string;
  actionUrl: string | null;
  audience: BroadcastAudience;
};

export type BroadcastOptions = {
  accessLevels: Array<{ id: string; name: string; memberCount: number }>;
  courses: Array<{ id: string; title: string; memberCount: number }>;
  totalUsers: number;
};

export type BroadcastErrorCode =
  | 'invalidInput'
  | 'titleRequired'
  | 'messageRequired'
  | 'titleTooLong'
  | 'messageTooLong'
  | 'invalidActionUrl'
  | 'noAudience'
  | 'operationFailed';

type Page<T> = { data: T[] | null; error: unknown };
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadRows<T>(query: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query(from, from + 499);
    if (error || !data) throw new Error('broadcastAudienceReadFailed');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

function activeEnrollmentRows(nowIso: string) {
  const supabase = createAdminClient();
  return loadRows<{ user_id: string; access_level_id: string }>((from, to) =>
    supabase.from('enrollments')
      .select('user_id, access_level_id, profile:profiles!inner(status)')
      .eq('is_active', true)
      .eq('profile.status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('id')
      .range(from, to),
  );
}

/** Load the composer without treating inactive or expired accounts as reachable. */
export async function getBroadcastOptions(): Promise<BroadcastOptions> {
  await requireAdmin();
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  try {
    const [levelsResult, coursesResult, usersResult, enrollments, courseMaps] = await Promise.all([
      supabase.from('access_levels').select('id, name').order('name'),
      supabase.from('courses').select('id, title').eq('is_published', true).order('title'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      activeEnrollmentRows(nowIso),
      loadRows<{ access_level_id: string; course_id: string }>((from, to) =>
        supabase.from('access_level_courses').select('access_level_id, course_id')
          .order('access_level_id').order('course_id').range(from, to),
      ),
    ]);
    if (
      levelsResult.error || coursesResult.error || usersResult.error ||
      !levelsResult.data || !coursesResult.data || usersResult.count === null
    ) throw new Error('broadcastOptionsReadFailed');

    const byLevel = new Map<string, Set<string>>();
    for (const enrollment of enrollments) {
      const users = byLevel.get(enrollment.access_level_id) ?? new Set<string>();
      users.add(enrollment.user_id);
      byLevel.set(enrollment.access_level_id, users);
    }
    const levelsByCourse = new Map<string, Set<string>>();
    for (const map of courseMaps) {
      const levels = levelsByCourse.get(map.course_id) ?? new Set<string>();
      levels.add(map.access_level_id);
      levelsByCourse.set(map.course_id, levels);
    }
    const byCourse = new Map<string, number>();
    for (const [courseId, levelIds] of levelsByCourse) {
      const users = new Set<string>();
      for (const levelId of levelIds) {
        for (const userId of byLevel.get(levelId) ?? []) users.add(userId);
      }
      byCourse.set(courseId, users.size);
    }

    return {
      accessLevels: levelsResult.data.map((level) => ({
        id: level.id,
        name: level.name,
        memberCount: byLevel.get(level.id)?.size ?? 0,
      })),
      courses: coursesResult.data.map((course) => ({
        id: course.id,
        title: course.title,
        memberCount: byCourse.get(course.id) ?? 0,
      })),
      totalUsers: usersResult.count,
    };
  } catch (error) {
    console.error('[notifications.getBroadcastOptions] query failed:', error);
    throw new Error('loadFailed');
  }
}

/** Fan out authored text with a stable identity that survives partial retries. */
export async function sendBroadcast(
  input: BroadcastInput,
): Promise<{ sent: number } | { error: BroadcastErrorCode }> {
  await requireAdmin();
  if (
    !input ||
    typeof input.requestId !== 'string' ||
    !REQUEST_ID.test(input.requestId) ||
    typeof input.title !== 'string' ||
    typeof input.message !== 'string' ||
    !input.audience ||
    !['all', 'access_level', 'course'].includes(input.audience.kind)
  ) return { error: 'invalidInput' };

  const title = input.title.trim();
  const message = input.message.trim();
  if (title.length === 0) return { error: 'titleRequired' };
  if (message.length === 0) return { error: 'messageRequired' };
  if (title.length > 120) return { error: 'titleTooLong' };
  if (message.length > 600) return { error: 'messageTooLong' };

  let audience = input.audience;
  if (audience.kind !== 'all') {
    if (typeof audience.id !== 'string' || !audience.id.trim()) return { error: 'invalidInput' };
    audience = { ...audience, id: audience.id.trim() };
  }

  let actionUrl: string | null = null;
  if (input.actionUrl != null && input.actionUrl !== '') {
    if (typeof input.actionUrl !== 'string') return { error: 'invalidActionUrl' };
    const candidate = input.actionUrl.trim();
    if (candidate) {
      const normalized = normalizePublicUrl(candidate);
      if (!normalized || (!normalized.startsWith('/') && !normalized.startsWith('https://'))) {
        return { error: 'invalidActionUrl' };
      }
      actionUrl = normalized;
    }
  }

  let userIds: string[];
  try {
    userIds = await resolveAudience(audience, new Date().toISOString());
  } catch (error) {
    console.error('[notifications.sendBroadcast] audience query failed:', error);
    return { error: 'operationFailed' };
  }
  if (userIds.length === 0) return { error: 'noAudience' };

  let result: Awaited<ReturnType<typeof createNotifications>>;
  try {
    result = await createNotifications({
      userIds,
      type: 'announcement',
      title,
      message,
      actionUrl,
      dedupeKey: `broadcast/${input.requestId.toLowerCase()}`,
    });
  } catch (error) {
    console.error('[notifications.sendBroadcast] insert transport failed:', error);
    return { error: 'operationFailed' };
  }
  if ('error' in result) {
    console.error('[notifications.sendBroadcast] insert failed');
    return { error: 'operationFailed' };
  }
  return { sent: userIds.length };
}

async function resolveAudience(audience: BroadcastAudience, nowIso: string): Promise<string[]> {
  const supabase = createAdminClient();
  if (audience.kind === 'all') {
    const rows = await loadRows<{ id: string }>((from, to) =>
      supabase.from('profiles').select('id').eq('status', 'active')
        .order('id').range(from, to),
    );
    return rows.map((row) => row.id);
  }

  let levelIds: string[];
  if (audience.kind === 'access_level') {
    levelIds = [audience.id];
  } else {
    const maps = await loadRows<{ access_level_id: string }>((from, to) =>
      supabase.from('access_level_courses').select('access_level_id')
        .eq('course_id', audience.id).order('access_level_id').range(from, to),
    );
    levelIds = Array.from(new Set(maps.map((map) => map.access_level_id)));
    if (levelIds.length === 0) return [];
  }

  const rows = await loadRows<{ user_id: string }>((from, to) =>
    supabase.from('enrollments')
      .select('user_id, profile:profiles!inner(status)')
      .in('access_level_id', levelIds)
      .eq('is_active', true)
      .eq('profile.status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('id')
      .range(from, to),
  );
  return Array.from(new Set(rows.map((row) => row.user_id)));
}
