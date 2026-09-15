import {
  AdminDashboard,
  AdminDashboardLoadError,
} from '@/features/Admin/components/AdminDashboard';
import {
  getAdminKPIs,
  getRecentEnrollments,
} from '@/features/Admin/actions';
import { AdminOverviewReadError } from '@/features/Admin/errors';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  let result:
    | { ok: true; kpis: Awaited<ReturnType<typeof getAdminKPIs>>; enrollments: Awaited<ReturnType<typeof getRecentEnrollments>> }
    | { ok: false };
  try {
    const [kpis, enrollments] = await Promise.all([
      getAdminKPIs(),
      getRecentEnrollments(10),
    ]);
    result = { ok: true, kpis, enrollments };
  } catch (error) {
    if (!(error instanceof AdminOverviewReadError)) throw error;
    result = { ok: false };
  }
  if (!result.ok) return <AdminDashboardLoadError />;
  return <AdminDashboard initialKpis={result.kpis} initialEnrollments={result.enrollments} />;
}
