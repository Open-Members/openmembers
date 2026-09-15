"use server";

import { requireAdmin } from "@/core/access/admin";
import { revalidatePath } from "next/cache";
import { createEnrollmentSchema } from "@/core/validation/schemas";
import { notifyEnrollment } from "@/features/Enrollment/notifications";
import { applyManualEnrollment } from "./manual.server";
import { z } from "zod";

// ─── Enrollment management ─────────────────────────────────────────────────

export async function enrollUser(data: {
  userId: string;
  accessLevelId: string;
  source: string;
  sourceTransactionId?: string;
  expiresAt?: string;
  /**
   * Omitted assignments preserve existing cohorts; an explicit array replaces them.
   * Every assignment must belong to a distinct course granted by this access level.
   */
  cohortAssignments?: Array<{ courseId: string; cohortId: string }>;
}) {
  const { adminClient: admin } = await requireAdmin();

  const parsed = createEnrollmentSchema.safeParse({
    userId: data.userId,
    accessLevelId: data.accessLevelId,
    source: data.source,
    expiresAt: data.expiresAt,
  });

  if (!parsed.success) {
    return { error: "invalidEnrollment" };
  }

  const cohorts = z
    .array(z.object({ courseId: z.uuid(), cohortId: z.uuid() }))
    .optional()
    .safeParse(data.cohortAssignments);
  if (!cohorts.success) return { error: "invalidCohorts" };

  const grant = await applyManualEnrollment(admin, {
    ...parsed.data,
    sourceTransactionId: data.sourceTransactionId,
    cohortMode: cohorts.data === undefined ? "preserve" : "replace",
    cohorts: cohorts.data,
  });
  if ("error" in grant) return { error: "enrollmentFailed" };

  // Only notify on a brand-new enrollment — re-activating an existing row
  // would spam a welcome to users who already got one.
  if (grant.created) {
    try {
      await notifyEnrollment({
        userId: parsed.data.userId,
        accessLevelId: parsed.data.accessLevelId,
      });
    } catch {
      /* Enrollment is committed; notification delivery is independent. */
    }
  }

  revalidatePath("/admin/enrollments");
  return {
    success: true,
    data: { id: grant.enrollmentId, upserted: !grant.created },
  };
}

export async function deactivateEnrollment(enrollmentId: string) {
  const { adminClient } = await requireAdmin();

  const { data: updated, error } = await adminClient
    .from("enrollments")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", enrollmentId)
    .select("id")
    .maybeSingle();

  if (error || !updated) return { error: "enrollmentFailed" };

  revalidatePath("/admin/enrollments");
  return { success: true };
}

export async function reactivateEnrollment(enrollmentId: string) {
  const { adminClient } = await requireAdmin();

  const { data: updated, error } = await adminClient
    .from("enrollments")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", enrollmentId)
    .select("id")
    .maybeSingle();

  if (error || !updated) return { error: "enrollmentFailed" };

  revalidatePath("/admin/enrollments");
  return { success: true };
}
