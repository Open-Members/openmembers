"use server";

import { requireAdmin } from "@/core/access/admin";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/core/supabase/admin";
import {
  createCohortSchema,
  updateCohortSchema,
} from "@/core/validation/schemas";

export interface AdminCohort {
  id: string;
  courseId: string;
  name: string;
  slug: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  enrollmentCount: number;
  createdAt: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Bulk variant — returns cohorts for every course in `courseIds`, keyed
 * by course_id. Used by the grant-access modal which needs a per-course
 * dropdown for every course the selected access_level grants.
 */
export async function getCohortsForCourses(
  courseIds: string[],
): Promise<Record<string, AdminCohort[]>> {
  await requireAdmin();
  const result: Record<string, AdminCohort[]> = {};
  if (courseIds.length === 0) return result;

  const admin = createAdminClient();
  const { data: cohorts, error: cohortsError } = await admin
    .from("cohorts")
    .select(
      "id, course_id, name, slug, description, start_date, end_date, created_at",
    )
    .in("course_id", courseIds)
    .order("created_at", { ascending: false });

  if (cohortsError) throw new Error("loadFailed");
  if (!cohorts?.length) return result;

  // Enrollment counts in one query across all cohorts.
  const cohortIds = cohorts.map((c) => c.id);
  const { data: joinRows, error: joinsError } = await admin
    .from("enrollment_cohorts")
    .select("cohort_id")
    .in("cohort_id", cohortIds);
  if (joinsError) throw new Error("loadFailed");
  const countMap = new Map<string, number>();
  for (const row of joinRows ?? []) {
    countMap.set(row.cohort_id, (countMap.get(row.cohort_id) ?? 0) + 1);
  }

  for (const c of cohorts) {
    const list = result[c.course_id] ?? [];
    list.push({
      id: c.id,
      courseId: c.course_id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      startDate: c.start_date,
      endDate: c.end_date,
      enrollmentCount: countMap.get(c.id) ?? 0,
      createdAt: c.created_at,
    });
    result[c.course_id] = list;
  }
  return result;
}

/**
 * Cohorts scoped to a single course. Pass the course's UUID — the admin
 * flow always enters cohort management from inside a specific course's
 * editor, so a global list would just mislead.
 */
export async function getAdminCohorts(
  courseId: string,
): Promise<AdminCohort[]> {
  const { adminClient } = await requireAdmin();

  const { data: cohorts, error: cohortsError } = await adminClient
    .from("cohorts")
    .select(
      "id, course_id, name, slug, description, start_date, end_date, created_at",
    )
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  if (cohortsError) throw new Error("loadFailed");
  if (!cohorts?.length) return [];

  const ids = cohorts.map((c) => c.id);
  const { data: joinRows, error: joinsError } = await adminClient
    .from("enrollment_cohorts")
    .select("cohort_id")
    .in("cohort_id", ids);

  if (joinsError) throw new Error("loadFailed");
  const countMap = new Map<string, number>();
  for (const row of joinRows ?? []) {
    countMap.set(row.cohort_id, (countMap.get(row.cohort_id) ?? 0) + 1);
  }

  return cohorts.map((c) => ({
    id: c.id,
    courseId: c.course_id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    startDate: c.start_date,
    endDate: c.end_date,
    enrollmentCount: countMap.get(c.id) ?? 0,
    createdAt: c.created_at,
  }));
}

export async function createCohort(input: {
  courseId: string;
  name: string;
  slug?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}) {
  const { supabase } = await requireAdmin();

  if (!input.courseId) return { error: "invalidCohort" };

  const parsed = createCohortSchema.safeParse({
    name: input.name,
    slug: input.slug?.trim() || slugify(input.name),
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  if (!parsed.success) {
    return { error: "invalidCohort" };
  }

  if (
    parsed.data.startDate &&
    parsed.data.endDate &&
    parsed.data.endDate < parsed.data.startDate
  ) {
    return { error: "invalidDateRange" };
  }

  const { data, error } = await supabase
    .from("cohorts")
    .insert({
      course_id: input.courseId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      start_date: parsed.data.startDate ?? null,
      end_date: parsed.data.endDate ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: "cohortFailed" };

  revalidatePath("/admin/content");
  revalidatePath("/admin/users");
  return { success: true, data: { id: data.id } };
}

export async function updateCohort(input: {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { supabase } = await requireAdmin();

  const parsed = updateCohortSchema.safeParse({
    id: input.id,
    name: input.name,
    slug: input.slug,
    description: input.description,
    startDate: input.startDate === null ? undefined : input.startDate,
    endDate: input.endDate === null ? undefined : input.endDate,
  });
  if (!parsed.success) return { error: "invalidCohort" };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.slug !== undefined) updates.slug = parsed.data.slug;
  if (input.description !== undefined)
    updates.description = input.description || null;
  if (input.startDate !== undefined)
    updates.start_date = input.startDate || null;
  if (input.endDate !== undefined) updates.end_date = input.endDate || null;

  const { data: updated, error } = await supabase
    .from("cohorts")
    .update(updates)
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error || !updated) return { error: "cohortFailed" };

  revalidatePath("/admin/content");
  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteCohort(id: string) {
  const { supabase } = await requireAdmin();

  // enrollment_cohorts rows CASCADE via the cohort_id FK, so deleting a
  // cohort cleanly removes every student's membership in that turma but
  // leaves their enrollments intact.
  const { data: updated, error } = await supabase
    .from("cohorts")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !updated) return { error: "cohortFailed" };

  revalidatePath("/admin/content");
  revalidatePath("/admin/users");
  return { success: true };
}
