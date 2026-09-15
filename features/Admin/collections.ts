'use server';

import { requireAdmin } from '@/core/access/admin';

import { revalidatePath } from 'next/cache';
import type { AdminCollectionRow, RowType } from '@/features/Collections/types';

export async function getAdminCollections(): Promise<AdminCollectionRow[]> {
  const { supabase } = await requireAdmin();

  const { data: rows, error: rowsError } = await supabase
    .from('collections')
    .select('id, row_type, title, subtitle, sort_order, is_enabled, is_system')
    .order('sort_order');

  if (rowsError) throw new Error('loadFailed');
  if (!rows?.length) return [];

  const manualIds = rows
    .filter((r) => r.row_type === 'manual')
    .map((r) => r.id);

  const countsByCollection = new Map<string, number>();
  if (manualIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from('collection_courses')
      .select('collection_id')
      .in('collection_id', manualIds);
    if (linksError) throw new Error('loadFailed');
    for (const l of links ?? []) {
      countsByCollection.set(
        l.collection_id,
        (countsByCollection.get(l.collection_id) ?? 0) + 1,
      );
    }
  }

  return rows.map((r) => ({
    id: r.id,
    rowType: r.row_type as RowType,
    title: r.title,
    subtitle: r.subtitle,
    sortOrder: r.sort_order,
    isEnabled: r.is_enabled,
    isSystem: r.is_system,
    courseCount: countsByCollection.get(r.id) ?? 0,
  }));
}

export async function createManualCollection(input: {
  title: string;
  subtitle?: string | null;
}) {
  const { supabase } = await requireAdmin();

  if (!input.title?.trim()) return { error: 'titleRequired' };

  const { data: lastRow, error: lastRowError } = await supabase
    .from('collections')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastRowError) return { error: 'operationFailed' };

  const nextOrder = (lastRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('collections')
    .insert({
      row_type: 'manual',
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || null,
      sort_order: nextOrder,
      is_enabled: true,
      is_system: false,
    })
    .select('id')
    .single();

  if (error || !data) return { error: 'operationFailed' };

  revalidatePath('/admin/home');
  revalidatePath('/dashboard');
  return { success: true, data: { id: data.id } };
}

export async function updateCollection(
  id: string,
  input: {
    title?: string;
    subtitle?: string | null;
    isEnabled?: boolean;
  },
) {
  const { supabase } = await requireAdmin();

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.title !== undefined) {
    if (!input.title.trim()) return { error: 'titleRequired' };
    update.title = input.title.trim();
  }
  if (input.subtitle !== undefined) {
    update.subtitle = input.subtitle?.trim() || null;
  }
  if (input.isEnabled !== undefined) update.is_enabled = input.isEnabled;

  const { data: changed, error } = await supabase
    .from('collections')
    .update(update)
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'operationFailed' };
  if (!changed) return { error: 'notFound' };

  revalidatePath('/admin/home');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function deleteCollection(id: string) {
  const { supabase } = await requireAdmin();

  const { data: row, error: rowError } = await supabase
    .from('collections')
    .select('is_system')
    .eq('id', id)
    .maybeSingle();

  if (rowError) return { error: 'operationFailed' };
  if (!row) return { error: 'notFound' };
  if (row.is_system) return { error: 'systemCollection' };

  const { data: deleted, error } = await supabase
    .from('collections')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'operationFailed' };
  if (!deleted) return { error: 'notFound' };

  revalidatePath('/admin/home');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function reorderCollections(orderedIds: string[]) {
  const { supabase } = await requireAdmin();
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { error: 'invalidInput' };
  }

  const updates = orderedIds.map((id, index) =>
    supabase
      .from('collections')
      .update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle(),
  );
  const results = await Promise.all(updates);
  if (results.some((result) => result.error))
    return { error: 'operationFailed' };
  if (results.some((result) => !result.data)) return { error: 'notFound' };

  revalidatePath('/admin/home');
  revalidatePath('/dashboard');
  return { success: true };
}

export async function setManualCollectionCourses(
  collectionId: string,
  courseIds: string[],
) {
  const { supabase } = await requireAdmin();
  if (new Set(courseIds).size !== courseIds.length) {
    return { error: 'invalidInput' };
  }

  const { data: row, error: rowError } = await supabase
    .from('collections')
    .select('row_type')
    .eq('id', collectionId)
    .maybeSingle();
  if (rowError) return { error: 'operationFailed' };
  if (!row) return { error: 'notFound' };
  if (row.row_type !== 'manual') {
    return { error: 'manualCollection' };
  }

  const { data: existing, error: existingError } = await supabase
    .from('collection_courses')
    .select('course_id')
    .eq('collection_id', collectionId);
  if (existingError) return { error: 'operationFailed' };

  // Write the desired rows before deleting stale links. This is still a
  // sequence of confirmed writes, but an insert failure keeps the prior list.
  if (courseIds.length > 0) {
    const rows = courseIds.map((course_id, sort_order) => ({
      collection_id: collectionId,
      course_id,
      sort_order,
    }));
    const { data: upserted, error: upsertError } = await supabase
      .from('collection_courses')
      .upsert(rows, { onConflict: 'collection_id,course_id' })
      .select('course_id');
    if (upsertError || upserted?.length !== rows.length) {
      return { error: 'operationFailed' };
    }
  }

  const desiredIds = new Set(courseIds);
  const removedIds = (existing ?? [])
    .map((link) => link.course_id)
    .filter((courseId) => !desiredIds.has(courseId));
  if (removedIds.length > 0) {
    const { data: removed, error: removeError } = await supabase
      .from('collection_courses')
      .delete()
      .eq('collection_id', collectionId)
      .in('course_id', removedIds)
      .select('course_id');
    if (removeError || removed?.length !== removedIds.length) {
      return { error: 'operationFailed' };
    }
  }

  const { data: confirmed, error: confirmError } = await supabase
    .from('collection_courses')
    .select('course_id, sort_order')
    .eq('collection_id', collectionId)
    .order('sort_order');
  if (
    confirmError ||
    !confirmed ||
    confirmed.length !== courseIds.length ||
    confirmed.some((row, index) => row.course_id !== courseIds[index])
  ) {
    return { error: 'operationFailed' };
  }

  revalidatePath('/admin/home');
  revalidatePath('/dashboard');
  return { success: true };
}

/** Lightweight course list for the collection dialog picker. */
export async function listCoursesForPicker(): Promise<
  Array<{
    id: string;
    title: string;
    slug: string;
    thumbnail: string | null;
    isPublished: boolean;
  }>
> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('courses')
    .select(
      'id, title, slug, thumbnail_landscape_url, thumbnail_url, is_published',
    )
    .order('sort_order');
  if (error) throw new Error('loadFailed');
  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    thumbnail: c.thumbnail_landscape_url ?? c.thumbnail_url,
    isPublished: c.is_published,
  }));
}
