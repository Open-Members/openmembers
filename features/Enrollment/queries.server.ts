import { createClient } from '@/core/supabase/server';

// ─── Server-side: Check if user has access to a specific course ─────────────

export async function checkUserAccessServer(userId: string, courseId: string): Promise<boolean> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('access_level_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (!enrollments?.length) return false;

  const accessLevelIds = enrollments.map(e => e.access_level_id);

  const { data: mapping } = await supabase
    .from('access_level_courses')
    .select('access_level_id')
    .in('access_level_id', accessLevelIds)
    .eq('course_id', courseId)
    .limit(1);

  return (mapping?.length ?? 0) > 0;
}
