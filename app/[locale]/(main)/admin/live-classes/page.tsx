import { AdminLiveClasses } from '@/features/Admin/components/AdminLiveClasses';
import { getAdminLiveClasses } from '@/features/LiveClasses/actions';
import { getAdminCourses } from '@/features/Admin/actions';

export const dynamic = 'force-dynamic';

export default async function AdminLiveClassesPage() {
  const [liveClasses, courses] = await Promise.all([
    getAdminLiveClasses(),
    getAdminCourses(),
  ]);
  return <AdminLiveClasses initialData={liveClasses} courses={courses} />;
}
