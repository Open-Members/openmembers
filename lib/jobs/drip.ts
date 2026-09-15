import { createAdminClient } from '@/core/supabase/admin';
import { renderNotificationDescriptor, type NotificationDescriptor } from '@/core/notifications/messages';

export type DripRule = { id: string; course_id: string; lesson_id: string | null; module_id: string | null; rule_type: string; fixed_date: string | null; days_after: number | null };
type Enrollment = { user_id: string; enrolled_at: string };
const DAY = 86_400_000;

/** Keep timestamps, not calendar dates: notifications must never precede access. */
export function dripRecipients(rule: Pick<DripRule, 'rule_type' | 'fixed_date' | 'days_after'>, enrollments: Enrollment[], now: number) {
  const earliest = new Map<string, number>();
  for (const enrollment of enrollments) {
    const time = Date.parse(enrollment.enrolled_at);
    if (Number.isFinite(time)) earliest.set(enrollment.user_id, Math.min(earliest.get(enrollment.user_id) ?? Infinity, time));
  }
  return [...earliest].flatMap(([userId, enrolledAt]) => {
    const unlockAt = rule.rule_type === 'fixed_date' ? Date.parse(rule.fixed_date ?? '') : enrolledAt + (rule.days_after ?? 0) * DAY;
    return unlockAt <= now && unlockAt >= now - 7 * DAY ? [{ userId, unlockAt: new Date(unlockAt).toISOString() }] : [];
  });
}

/** Input is ordered by created_at,id, matching the access policy's canonical rule. */
export function canonicalDripRules(rules: DripRule[]) {
  const seen = new Set<string>();
  return rules.filter(rule => {
    const target = rule.lesson_id ? `lesson/${rule.lesson_id}` : rule.module_id ? `module/${rule.module_id}` : `course/${rule.course_id}`;
    if (seen.has(target)) return false;
    seen.add(target);
    return true;
  });
}

export async function loadJobRows<T>(query: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const result: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await query(start, start + 499);
    if (error) throw new Error('Drip query failed');
    result.push(...(data ?? []));
    if (!data || data.length < 500) return result;
  }
}

export async function runDripCheck(now = new Date()) {
  const supabase = createAdminClient();
  const rules = canonicalDripRules(await loadJobRows<DripRule>((start, end) => supabase.from('drip_rules').select('*').order('created_at').order('id').range(start, end)));
  let notified = 0;
  for (const rule of rules) {
    const { data: course, error: courseError } = await supabase.from('courses').select('title,slug,is_published,is_coming_soon').eq('id', rule.course_id).maybeSingle();
    if (courseError) throw new Error('Drip course query failed');
    if (!course?.is_published || course.is_coming_soon) continue;
    let descriptor: NotificationDescriptor = { key: 'content.dripCourse', params: { courseTitle: course.title } };
    let actionUrl = `/courses/${course.slug}`;
    if (rule.lesson_id) {
      const { data: lesson, error } = await supabase.from('lessons').select('title,slug,is_published,module:modules(is_published)').eq('id', rule.lesson_id).maybeSingle();
      if (error) throw new Error('Drip lesson query failed');
      const moduleRow = lesson?.module as unknown as { is_published: boolean } | null;
      if (!lesson?.is_published || !moduleRow?.is_published) continue;
      descriptor = { key: 'content.dripLesson', params: { courseTitle: course.title, contentTitle: lesson.title } };
      actionUrl += `/${lesson.slug}`;
    } else if (rule.module_id) {
      const { data: moduleRow, error } = await supabase.from('modules').select('title,is_published').eq('id', rule.module_id).maybeSingle();
      if (error) throw new Error('Drip module query failed');
      if (!moduleRow?.is_published) continue;
      descriptor = { key: 'content.dripModule', params: { courseTitle: course.title, contentTitle: moduleRow.title } };
    }
    const mappings = await loadJobRows<{ access_level_id: string }>((start, end) => supabase.from('access_level_courses').select('access_level_id').eq('course_id', rule.course_id).order('access_level_id').range(start, end));
    if (!mappings.length) continue;
    const enrollments = await loadJobRows<Enrollment>((start, end) => supabase.from('enrollments').select('user_id,enrolled_at,profile:profiles!inner(status)')
      .in('access_level_id', mappings.map(mapping => mapping.access_level_id)).eq('is_active', true).eq('profile.status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`).order('id').range(start, end));
    const recipients = dripRecipients(rule, enrollments, now.getTime());
    const fallback = renderNotificationDescriptor(descriptor, 'en');
    if (!fallback) throw new Error('Drip notification descriptor failed');
    for (let start = 0; start < recipients.length; start += 500) {
      const { data, error } = await supabase.from('notifications').upsert(recipients.slice(start, start + 500).map(recipient => ({
        user_id: recipient.userId, type: 'drip_unlock', title: fallback.title, message: fallback.message,
        message_key: descriptor.key, message_params: descriptor.params,
        action_url: actionUrl, dedupe_key: `drip/${rule.id}/${recipient.unlockAt}`,
      })), { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }).select('id');
      if (error || !data) throw new Error('Drip notification insert failed');
      notified += data?.length ?? 0;
    }
  }
  return { processed: rules.length, notified, ranAt: now.toISOString() };
}
