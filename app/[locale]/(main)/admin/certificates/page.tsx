import { AdminCertificates } from '@/features/Admin/components/AdminCertificates';
import { getAdminCertificateSettings } from '@/features/Admin/certificates';
import { getTenantSettings } from '@/core/theme/settings';

export const dynamic = 'force-dynamic';

export default async function AdminCertificatesPage() {
  const [settings, tenant] = await Promise.all([
    getAdminCertificateSettings(),
    getTenantSettings(),
  ]);
  return (
    <AdminCertificates
      initialSettings={settings}
      tenantPrimaryColor={tenant.primary_color}
    />
  );
}
