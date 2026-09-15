import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/core/supabase/server';
import { fetchCourseDetailServer } from '@/features/Courses/queries.server';
import { CourseOverview } from '@/features/Courses/components/CourseOverview';
import { markCourseFirstAccess } from '@/lib/activity/track';
import { courseAccessHref } from '@/shared/config/sales';

export const dynamic = 'force-dynamic';

export default async function CourseOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const course = await fetchCourseDetailServer(slug, user.id);
  if (!course) notFound();

  // A configured offer can provide access; otherwise ask the installation's
  // support team. Never infer that a purchase is available.
  if (!course.isAccessible) {
    redirect(courseAccessHref(course.checkoutUrl));
  }

  // Stamp first_accessed_at on the enrollment(s) that grant this course.
  // Helper swallows its own errors — we never want a tracking hiccup to
  // prevent the page from rendering.
  if (course.isAccessible) {
    await markCourseFirstAccess(user.id, course.id);
  }

  return <CourseOverview course={course} />;
}
