import { createClient } from '@/core/supabase/client';
import { createAdminClient } from '@/core/supabase/admin';

// ─── Student: Check if user has access to a specific course ────────────────

export async function checkUserAccess(userId: string, courseId: string): Promise<boolean> {
  const supabase = createClient();
  const now = new Date().toISOString();

  // Get active, non-expired enrollments for this user
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('access_level_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (!enrollments?.length) return false;

  const accessLevelIds = enrollments.map(e => e.access_level_id);

  // Check if any of those access levels include this course
  const { data: mapping } = await supabase
    .from('access_level_courses')
    .select('access_level_id')
    .in('access_level_id', accessLevelIds)
    .eq('course_id', courseId)
    .limit(1);

  return (mapping?.length ?? 0) > 0;
}

// ─── Student: Fetch user enrollments with access level and course info ─────

export async function fetchUserEnrollments(userId: string) {
  const supabase = createClient();

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select(`
      id,
      user_id,
      access_level_id,
      source,
      source_transaction_id,
      enrolled_at,
      expires_at,
      is_active,
      created_at,
      updated_at,
      access_levels (
        id,
        name,
        slug,
        description
      )
    `)
    .eq('user_id', userId)
    .order('enrolled_at', { ascending: false });

  if (!enrollments?.length) return [];

  // For each enrollment, fetch the courses mapped to its access level
  const accessLevelIds = [...new Set(enrollments.map(e => e.access_level_id))];

  const { data: courseMappings } = await supabase
    .from('access_level_courses')
    .select(`
      access_level_id,
      course_id,
      courses (
        id,
        title,
        slug,
        thumbnail_url
      )
    `)
    .in('access_level_id', accessLevelIds);

  // Group courses by access level
  const coursesByAccessLevel = new Map<string, Array<{
    id: string;
    title: string;
    slug: string;
    thumbnailUrl?: string;
  }>>();

  for (const mapping of courseMappings ?? []) {
    const course = mapping.courses as unknown as {
      id: string;
      title: string;
      slug: string;
      thumbnail_url?: string;
    } | null;
    if (!course) continue;

    const list = coursesByAccessLevel.get(mapping.access_level_id) ?? [];
    list.push({
      id: course.id,
      title: course.title,
      slug: course.slug,
      thumbnailUrl: course.thumbnail_url ?? undefined,
    });
    coursesByAccessLevel.set(mapping.access_level_id, list);
  }

  return enrollments.map(enrollment => {
    const accessLevel = enrollment.access_levels as unknown as {
      id: string;
      name: string;
      slug: string;
      description: string | null;
    } | null;

    return {
      id: enrollment.id,
      userId: enrollment.user_id,
      accessLevelId: enrollment.access_level_id,
      source: enrollment.source,
      sourceTransactionId: enrollment.source_transaction_id ?? undefined,
      enrolledAt: enrollment.enrolled_at,
      expiresAt: enrollment.expires_at ?? undefined,
      isActive: enrollment.is_active,
      createdAt: enrollment.created_at,
      updatedAt: enrollment.updated_at,
      accessLevel: accessLevel
        ? {
            id: accessLevel.id,
            name: accessLevel.name,
            slug: accessLevel.slug,
            description: accessLevel.description ?? undefined,
          }
        : undefined,
      courses: coursesByAccessLevel.get(enrollment.access_level_id) ?? [],
    };
  });
}

// ─── Admin: Fetch all access levels with mapped courses ────────────────────

export async function fetchAllAccessLevels() {
  const supabase = createClient();

  const { data: accessLevels } = await supabase
    .from('access_levels')
    .select('*')
    .order('created_at', { ascending: false });

  if (!accessLevels?.length) return [];

  const accessLevelIds = accessLevels.map(al => al.id);

  const { data: courseMappings } = await supabase
    .from('access_level_courses')
    .select(`
      access_level_id,
      course_id,
      courses (
        id,
        title,
        slug
      )
    `)
    .in('access_level_id', accessLevelIds);

  // Group courses by access level
  const coursesByAccessLevel = new Map<string, Array<{
    id: string;
    title: string;
    slug: string;
  }>>();

  for (const mapping of courseMappings ?? []) {
    const course = mapping.courses as unknown as {
      id: string;
      title: string;
      slug: string;
    } | null;
    if (!course) continue;

    const list = coursesByAccessLevel.get(mapping.access_level_id) ?? [];
    list.push({ id: course.id, title: course.title, slug: course.slug });
    coursesByAccessLevel.set(mapping.access_level_id, list);
  }

  return accessLevels.map(al => ({
    id: al.id,
    name: al.name,
    slug: al.slug,
    description: al.description ?? undefined,
    createdAt: al.created_at,
    courses: coursesByAccessLevel.get(al.id) ?? [],
  }));
}

// ─── Admin: Fetch all enrollments with user and access level info ──────────

export async function fetchAllEnrollments(search?: string) {
  const admin = createAdminClient();

  const query = admin
    .from('enrollments')
    .select(`
      id,
      user_id,
      access_level_id,
      source,
      source_transaction_id,
      enrolled_at,
      expires_at,
      is_active,
      created_at,
      updated_at,
      profiles (
        id,
        email,
        display_name
      ),
      access_levels (
        id,
        name,
        slug
      )
    `)
    .order('enrolled_at', { ascending: false });

  // If searching by email, we need to filter after fetching
  // because Supabase doesn't support filtering on joined columns directly
  const { data: enrollments } = await query;

  if (!enrollments?.length) return [];

  const results = enrollments.map(enrollment => {
    const profile = enrollment.profiles as unknown as {
      id: string;
      email: string;
      display_name: string | null;
    } | null;

    const accessLevel = enrollment.access_levels as unknown as {
      id: string;
      name: string;
      slug: string;
    } | null;

    return {
      id: enrollment.id,
      userId: enrollment.user_id,
      accessLevelId: enrollment.access_level_id,
      source: enrollment.source,
      sourceTransactionId: enrollment.source_transaction_id ?? undefined,
      enrolledAt: enrollment.enrolled_at,
      expiresAt: enrollment.expires_at ?? undefined,
      isActive: enrollment.is_active,
      createdAt: enrollment.created_at,
      updatedAt: enrollment.updated_at,
      user: profile
        ? {
            id: profile.id,
            email: profile.email,
            displayName: profile.display_name ?? undefined,
          }
        : undefined,
      accessLevel: accessLevel
        ? {
            id: accessLevel.id,
            name: accessLevel.name,
            slug: accessLevel.slug,
          }
        : undefined,
    };
  });

  // Filter by search term if provided
  if (search) {
    const term = search.toLowerCase();
    return results.filter(r =>
      r.user?.email?.toLowerCase().includes(term) ||
      r.user?.displayName?.toLowerCase().includes(term)
    );
  }

  return results;
}
