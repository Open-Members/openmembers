import { AdminAnnouncements } from '@/features/Notifications/components/AdminAnnouncements';
import { getBroadcastOptions } from '@/features/Notifications/admin-actions';

export const dynamic = 'force-dynamic';

export default async function AdminAnnouncementsPage() {
  const options = await getBroadcastOptions();
  return <AdminAnnouncements options={options} />;
}
