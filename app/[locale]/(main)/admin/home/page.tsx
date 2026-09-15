import { AdminHomeLayout } from '@/features/Admin/components/AdminHomeLayout';
import { getAdminCollections } from '@/features/Admin/collections';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const rows = await getAdminCollections();
  return <AdminHomeLayout initialData={rows} />;
}
