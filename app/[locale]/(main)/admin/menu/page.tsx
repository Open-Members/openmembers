import { AdminCustomMenu } from '@/features/Admin/components/AdminCustomMenu';
import { listCustomMenuItems } from '@/features/Admin/actions';

export const dynamic = 'force-dynamic';

export default async function AdminMenuPage() {
  const items = await listCustomMenuItems();
  return <AdminCustomMenu initialItems={items} />;
}
