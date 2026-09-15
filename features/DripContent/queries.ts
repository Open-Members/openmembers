import { createClient } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import { isUserCourseAccessible, isUserLessonAccessible } from '@/core/access/server';

export interface UnlockStatus {
  unlocked: boolean;
  unlocksAt?: Date;
}

type Rule = {
  lesson_id: string | null;
  module_id: string | null;
  rule_type: string;
  days_after: number | null;
  fixed_date: string | null;
};

/** Informational date only. Actual permission always comes from the database RPC. */
export function calculateUnlockDate(rule: Rule | undefined, enrolledAt: Date | null): Date | undefined {
  if (!rule) return undefined;
  if (rule.rule_type === 'fixed_date' && rule.fixed_date) {
    const date = new Date(rule.fixed_date);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
  if (rule.rule_type === 'days_after_enrollment' && enrolledAt && rule.days_after !== null && rule.days_after >= 0) {
    const timestamp = enrolledAt.getTime() + rule.days_after * 86_400_000;
    return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
  }
  return undefined;
}

/** Unknown/hidden lessons and database errors are denied by the shared access gate. */
export async function isContentUnlocked(userId: string, lessonId: string): Promise<UnlockStatus> {
  return { unlocked: await isUserLessonAccessible(userId, lessonId) };
}

/**
 * Load only schedule metadata with elevated access so locked lessons may show a
 * release date. Never load lesson bodies here and never derive permission from
 * this metadata: every lesson's decision is made with the caller's session.
 */
export async function getUnlockDates(userId: string, courseId: string): Promise<Map<string, UnlockStatus>> {
  const result = new Map<string, UnlockStatus>();
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== userId) return result;
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('role, status').eq('id', user.id).maybeSingle();
    if (profileError || !profile || profile.status !== 'active') return result;
    const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';
    const admin = createAdminClient();
    const { data: course, error: courseError } = await admin.from('courses')
      .select('id, is_published, is_coming_soon').eq('id', courseId).maybeSingle();
    if (courseError || !course || (!isAdmin && (!course.is_published || course.is_coming_soon))) return result;

    let moduleQuery = admin.from('modules').select('id').eq('course_id', courseId);
    if (!isAdmin) moduleQuery = moduleQuery.eq('is_published', true);
    const { data: modules, error: modulesError } = await moduleQuery;
    if (modulesError || !modules?.length) return result;
    let lessonQuery = admin.from('lessons').select('id, module_id').in('module_id', modules.map((module) => module.id));
    if (!isAdmin) lessonQuery = lessonQuery.eq('is_published', true);
    const { data: lessons, error: lessonsError } = await lessonQuery;
    if (lessonsError || !lessons?.length) return result;

    let enrolledAt: Date | null = null;
    let rules: Rule[] = [];
    if (await isUserCourseAccessible(userId, courseId)) {
      const [{ data: enrollments, error: enrollmentsError }, { data: mappings, error: mappingsError }, { data: rawRules, error: rulesError }] = await Promise.all([
        supabase.from('enrollments').select('access_level_id, enrolled_at').eq('user_id', userId)
          .eq('is_active', true).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
        admin.from('access_level_courses').select('access_level_id').eq('course_id', courseId),
        admin.from('drip_rules').select('lesson_id, module_id, rule_type, days_after, fixed_date').eq('course_id', courseId),
      ]);
      if (!enrollmentsError && !mappingsError && !rulesError) {
        const validLevels = new Set((mappings ?? []).map((mapping) => mapping.access_level_id));
        const starts = (enrollments ?? []).filter((enrollment) => validLevels.has(enrollment.access_level_id))
          .map((enrollment) => new Date(enrollment.enrolled_at).getTime()).filter(Number.isFinite);
        if (starts.length) enrolledAt = new Date(Math.min(...starts));
        rules = (rawRules ?? []) as Rule[];
      }
    }

    await Promise.all(lessons.map(async (lesson) => {
      const unlocked = await isUserLessonAccessible(userId, lesson.id);
      const rule = rules.find((item) => item.lesson_id === lesson.id)
        ?? rules.find((item) => !item.lesson_id && item.module_id === lesson.module_id)
        ?? rules.find((item) => !item.lesson_id && !item.module_id);
      const unlocksAt = unlocked ? undefined : calculateUnlockDate(rule, enrolledAt);
      result.set(lesson.id, unlocksAt ? { unlocked, unlocksAt } : { unlocked });
    }));
  } catch {
    // Empty metadata never grants access; callers must use the shared access gate.
  }
  return result;
}
