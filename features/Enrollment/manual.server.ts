import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const resultSchema = z.object({ enrollment_id: z.uuid(), created: z.boolean() });

/** The caller must obtain this service client through the administrative guard. */
export async function applyManualEnrollment(admin: Pick<SupabaseClient, 'rpc'>, input: {
  userId: string;
  accessLevelId: string;
  source: string;
  sourceTransactionId?: string | null;
  expiresAt?: string | null;
  cohortMode: 'preserve' | 'replace' | 'merge';
  cohorts?: Array<{ courseId?: string; cohortId: string }>;
}): Promise<{ error: string } | { enrollmentId: string; created: boolean }> {
  const { data, error } = await admin.rpc('apply_manual_enrollment', {
    p_user_id: input.userId,
    p_access_level_id: input.accessLevelId,
    p_source: input.source,
    p_source_transaction_id: input.sourceTransactionId ?? null,
    p_expires_at: input.expiresAt ?? null,
    p_cohort_mode: input.cohortMode,
    p_cohorts: (input.cohorts ?? []).map(cohort => ({ course_id: cohort.courseId ?? null, cohort_id: cohort.cohortId })),
  });
  if (error) return { error: error.message };
  const result = resultSchema.safeParse(data);
  if (!result.success) return { error: 'Could not confirm the enrollment change.' };
  return { enrollmentId: result.data.enrollment_id, created: result.data.created };
}
