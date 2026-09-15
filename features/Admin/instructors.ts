'use server';

import { requireAdmin } from '@/core/access/admin';

import { revalidatePath } from 'next/cache';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface AdminInstructor {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  portraitUrl: string | null;
  bio: string | null;
  courseCount: number;
}

export async function getInstructors(): Promise<AdminInstructor[]> {
  const { supabase } = await requireAdmin();

  const { data: rows, error: rowsError } = await supabase
    .from('instructors')
    .select('id, slug, name, headline, portrait_url, bio')
    .order('name');

  if (rowsError) throw new Error('loadFailed');
  if (!rows?.length) return [];

  const { data: courseCounts, error: courseCountsError } = await supabase
    .from('courses')
    .select('instructor_id')
    .in(
      'instructor_id',
      rows.map((r) => r.id),
    );

  if (courseCountsError) throw new Error('loadFailed');

  const counts = new Map<string, number>();
  for (const c of courseCounts ?? []) {
    if (c.instructor_id) {
      counts.set(c.instructor_id, (counts.get(c.instructor_id) ?? 0) + 1);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    headline: r.headline,
    portraitUrl: r.portrait_url,
    bio: r.bio,
    courseCount: counts.get(r.id) ?? 0,
  }));
}

export interface InstructorInput {
  name: string;
  slug?: string;
  headline?: string | null;
  portraitUrl?: string | null;
  bio?: string | null;
}

export async function createInstructor(input: InstructorInput) {
  const { supabase } = await requireAdmin();

  const name = input.name?.trim();
  if (!name) return { error: 'nameRequired' };

  const slug = (input.slug?.trim() || slugify(name)).slice(0, 200);
  if (!slug) return { error: 'slugInvalid' };

  const { data, error } = await supabase
    .from('instructors')
    .insert({
      slug,
      name,
      headline: input.headline?.trim() || null,
      portrait_url: input.portraitUrl ?? null,
      bio: input.bio?.trim() || null,
    })
    .select('id')
    .single();

  if (error || !data) return { error: 'operationFailed' };

  revalidatePath('/admin/content');
  return { success: true, data: { id: data.id } };
}

export async function updateInstructor(id: string, input: InstructorInput) {
  const { supabase } = await requireAdmin();

  const name = input.name?.trim();
  if (!name) return { error: 'nameRequired' };

  const update: Record<string, unknown> = {
    name,
    headline: input.headline?.trim() || null,
    portrait_url: input.portraitUrl ?? null,
    bio: input.bio?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (input.slug) update.slug = input.slug.trim();

  const { data: changed, error } = await supabase
    .from('instructors')
    .update(update)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { error: 'operationFailed' };
  if (!changed) return { error: 'notFound' };

  revalidatePath('/admin/content');
  return { success: true };
}

export async function deleteInstructor(id: string) {
  const { supabase } = await requireAdmin();

  // courses.instructor_id uses ON DELETE SET NULL — safe to remove.
  const { data: deleted, error } = await supabase
    .from('instructors')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'operationFailed' };
  if (!deleted) return { error: 'notFound' };

  revalidatePath('/admin/content');
  return { success: true };
}
