import { AdminOffersPage } from '@/features/Admin/components/AdminOffersPage';
import {
  getAdminCoursesLite,
  getAdminEnrollments,
  getAdminWebhookConfigs,
  getAllOffers,
} from '@/features/Admin/actions';

export const dynamic = 'force-dynamic';

export default async function AdminOffersRoute() {
  const [offers, configs, courses, enrollments] = await Promise.all([
    getAllOffers(),
    getAdminWebhookConfigs(),
    getAdminCoursesLite(),
    getAdminEnrollments('all', 50),
  ]);

  return (
    <AdminOffersPage
      offers={offers}
      configs={configs}
      courses={courses}
      enrollments={enrollments}
    />
  );
}
