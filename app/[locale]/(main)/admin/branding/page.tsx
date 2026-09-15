import { AdminBranding } from '@/features/Admin/components/AdminBranding';
import { getAdminBranding } from '@/features/Admin/actions';

export const dynamic = 'force-dynamic';

export default async function AdminBrandingPage() {
  const settings = await getAdminBranding();
  return <AdminBranding initialSettings={settings} />;
}
