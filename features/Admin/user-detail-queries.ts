import "server-only";
import { requireAdmin } from "@/core/access/admin";

// ─── DTOs ──────────────────────────────────────────────────────────

export interface StudentProfile {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  country: string | null;
  phone: string | null;
  signupSource: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface StudentEnrollmentRow {
  id: string;
  accessLevelName: string;
  enrolledAt: string;
  expiresAt: string | null;
  isActive: boolean;
  revokedAt: string | null;
  source: string;
}

export type ActivityKind =
  | "lesson_completed"
  | "rating_given"
  | "enrollment_new"
  | "chat_started"
  | "live_class_clicked";

export interface ActivityItem {
  kind: ActivityKind;
  at: string;
  title: string;
  detail: string | null;
  href: string | null;
  stars?: number;
  source?: string;
}

export interface StudentDetail {
  profile: StudentProfile;
  enrollments: StudentEnrollmentRow[];
  activity: ActivityItem[];
}

// ─── Main loader ───────────────────────────────────────────────────

export async function getStudentDetail(
  userId: string,
): Promise<StudentDetail | null> {
  const { adminClient: admin } = await requireAdmin();

  // 1. Profile + email.
  const [
    { data: profile, error: profileError },
    { data: authRes, error: authError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id, display_name, avatar_url, role, status, country, phone, signup_source, created_at, last_login_at",
      )
      .eq("id", userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);

  if (profileError || authError) throw new Error("loadFailed");
  if (!profile) return null;

  const out: StudentProfile = {
    id: profile.id,
    displayName: profile.display_name ?? "",
    email: authRes?.user?.email ?? "",
    avatarUrl: profile.avatar_url ?? null,
    role: profile.role ?? "user",
    status: profile.status ?? "active",
    country: profile.country ?? null,
    phone: profile.phone ?? null,
    signupSource: profile.signup_source ?? null,
    createdAt: profile.created_at,
    lastLoginAt: profile.last_login_at,
  };

  // 2. Enrollments.
  const { data: enrollmentRows, error: enrollmentError } = await admin
    .from("enrollments")
    .select(
      "id, access_level_id, source, enrolled_at, expires_at, is_active, revoked_at, access_levels!inner(name)",
    )
    .eq("user_id", userId)
    .order("enrolled_at", { ascending: false });

  if (enrollmentError) throw new Error("loadFailed");
  type EnrollRow = {
    id: string;
    access_level_id: string;
    source: string;
    enrolled_at: string;
    expires_at: string | null;
    is_active: boolean;
    revoked_at: string | null;
    access_levels: { name: string } | { name: string }[] | null;
  };

  const enrollments: StudentEnrollmentRow[] = (
    (enrollmentRows ?? []) as EnrollRow[]
  ).map((r) => {
    const al = Array.isArray(r.access_levels)
      ? r.access_levels[0]
      : r.access_levels;
    return {
      id: r.id,
      accessLevelName: al?.name ?? "",
      enrolledAt: r.enrolled_at,
      expiresAt: r.expires_at,
      isActive: r.is_active,
      revokedAt: r.revoked_at,
      source: r.source,
    };
  });

  // 3. Activity feed — union of several event sources, merged by timestamp.
  const [
    { data: completions, error: completionsError },
    { data: ratings, error: ratingsError },
    { data: newConvs, error: newConvsError },
    { data: liveClicks, error: liveClicksError },
  ] = await Promise.all([
    admin
      .from("lesson_progress")
      .select(
        "lesson_id, completed_at, is_completed, lessons!inner(title, slug, modules!inner(course_id, courses!inner(title, slug)))",
      )
      .eq("user_id", userId)
      .eq("is_completed", true)
      .order("completed_at", { ascending: false })
      .limit(50),
    admin
      .from("lesson_ratings")
      .select(
        "lesson_id, stars, created_at, lessons!inner(title, slug, modules!inner(courses!inner(slug, title)))",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("chat_conversations")
      .select("id, title, course_id, created_at, courses(title)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("live_class_clicks")
      .select(
        "clicked_at, live_class_id, live_classes!inner(title, live_class_courses(courses(title)))",
      )
      .eq("user_id", userId)
      .order("clicked_at", { ascending: false })
      .limit(50),
  ]);

  if (completionsError || ratingsError || newConvsError || liveClicksError)
    throw new Error("loadFailed");
  const activity: ActivityItem[] = [];

  type CompleteRow = {
    lesson_id: string;
    completed_at: string;
    lessons:
      | {
          title: string;
          slug: string;
          modules:
            | {
                courses:
                  | { title: string; slug: string }
                  | { title: string; slug: string }[]
                  | null;
              }
            | {
                courses:
                  | { title: string; slug: string }
                  | { title: string; slug: string }[]
                  | null;
              }[]
            | null;
        }
      | {
          title: string;
          slug: string;
          modules:
            | {
                courses:
                  | { title: string; slug: string }
                  | { title: string; slug: string }[]
                  | null;
              }
            | {
                courses:
                  | { title: string; slug: string }
                  | { title: string; slug: string }[]
                  | null;
              }[]
            | null;
        }[]
      | null;
  };
  for (const r of (completions ?? []) as CompleteRow[]) {
    const lesson = Array.isArray(r.lessons) ? r.lessons[0] : r.lessons;
    const modules = lesson
      ? Array.isArray(lesson.modules)
        ? lesson.modules[0]
        : lesson.modules
      : null;
    const course = modules?.courses
      ? Array.isArray(modules.courses)
        ? modules.courses[0]
        : modules.courses
      : null;
    activity.push({
      kind: "lesson_completed",
      at: r.completed_at,
      title: lesson?.title ?? "",
      detail: course?.title ?? null,
      href:
        course?.slug && lesson?.slug
          ? `/courses/${course.slug}/${lesson.slug}`
          : null,
    });
  }

  type RatingRow = {
    lesson_id: string;
    stars: number;
    created_at: string;
    lessons:
      | {
          title: string;
          slug: string;
          modules:
            | {
                courses:
                  | { title: string; slug: string }
                  | { title: string; slug: string }[]
                  | null;
              }
            | {
                courses:
                  | { title: string; slug: string }
                  | { title: string; slug: string }[]
                  | null;
              }[]
            | null;
        }
      | {
          title: string;
          slug: string;
          modules:
            | {
                courses:
                  | { title: string; slug: string }
                  | { title: string; slug: string }[]
                  | null;
              }
            | {
                courses:
                  | { title: string; slug: string }
                  | { title: string; slug: string }[]
                  | null;
              }[]
            | null;
        }[]
      | null;
  };
  for (const r of (ratings ?? []) as RatingRow[]) {
    const lesson = Array.isArray(r.lessons) ? r.lessons[0] : r.lessons;
    const modules = lesson
      ? Array.isArray(lesson.modules)
        ? lesson.modules[0]
        : lesson.modules
      : null;
    const course = modules?.courses
      ? Array.isArray(modules.courses)
        ? modules.courses[0]
        : modules.courses
      : null;
    activity.push({
      kind: "rating_given",
      at: r.created_at,
      title: lesson?.title ?? "",
      stars: r.stars,
      detail: course?.title ?? null,
      href:
        course?.slug && lesson?.slug
          ? `/courses/${course.slug}/${lesson.slug}`
          : null,
    });
  }

  // Enrollments as activity items.
  for (const e of enrollments) {
    activity.push({
      kind: "enrollment_new",
      at: e.enrolledAt,
      title: e.accessLevelName,
      source: e.source,
      detail: null,
      href: null,
    });
  }

  type ChatRow = {
    id: string;
    title: string;
    course_id: string;
    created_at: string;
    courses: { title: string } | { title: string }[] | null;
  };
  for (const c of (newConvs ?? []) as ChatRow[]) {
    const course = Array.isArray(c.courses) ? c.courses[0] : c.courses;
    activity.push({
      kind: "chat_started",
      at: c.created_at,
      title: c.title || "",
      detail: course?.title ?? null,
      href: null,
    });
  }

  type ClickRow = {
    clicked_at: string;
    live_class_id: string;
    live_classes:
      | {
          title: string;
          live_class_courses: Array<{
            courses: { title: string } | { title: string }[] | null;
          }> | null;
        }
      | {
          title: string;
          live_class_courses: Array<{
            courses: { title: string } | { title: string }[] | null;
          }> | null;
        }[]
      | null;
  };
  for (const c of (liveClicks ?? []) as ClickRow[]) {
    const lc = Array.isArray(c.live_classes)
      ? c.live_classes[0]
      : c.live_classes;
    const courses: string[] = [];
    for (const link of lc?.live_class_courses ?? []) {
      const course = Array.isArray(link.courses)
        ? link.courses[0]
        : link.courses;
      if (course?.title) courses.push(course.title);
    }
    activity.push({
      kind: "live_class_clicked",
      at: c.clicked_at,
      title: lc?.title ?? "",
      detail: courses.join(", ") || null,
      href: null,
    });
  }

  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    profile: out,
    enrollments,
    activity: activity.slice(0, 80),
  };
}
