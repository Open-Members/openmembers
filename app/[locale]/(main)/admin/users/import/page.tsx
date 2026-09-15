import { AdminImportStudents } from '@/features/Admin/components/AdminImportStudents';
import { getAdminAccessLevels } from '@/features/Admin/actions';

export const dynamic = 'force-dynamic';

export default async function AdminImportStudentsPage() {
  const accessLevels = await getAdminAccessLevels();
  return <AdminImportStudents accessLevels={accessLevels} />;
}
