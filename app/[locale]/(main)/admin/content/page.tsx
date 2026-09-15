import { AdminCourses } from '@/features/Admin/components/AdminCourses';
import { getAdminCourses } from '@/features/Admin/actions';
import { getInstructors } from '@/features/Admin/instructors';
import { isR2Configured } from '@/lib/services/r2/client';

export const dynamic = 'force-dynamic';

export default async function AdminCoursesPage() {
  const [courses, instructors] = await Promise.all([
    getAdminCourses(),
    getInstructors(),
  ]);
  return <AdminCourses initialCourses={courses} initialInstructors={instructors} r2Available={isR2Configured()} />;
}
