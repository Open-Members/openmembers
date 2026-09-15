import { notFound } from 'next/navigation';
import { AdminUserDetail } from '@/features/Admin/components/AdminUserDetail';
import { getStudentDetail } from '@/features/Admin/user-detail-queries';
import { requireAdmin } from '@/core/access/admin';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getStudentDetail(id);
  if (!detail) notFound();
  return <AdminUserDetail detail={detail} />;
}
