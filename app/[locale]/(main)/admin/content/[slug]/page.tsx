import { notFound } from 'next/navigation';
import { AdminCourseContent } from '@/features/Admin/components/AdminCourseContent';
import { getCourseContent } from '@/features/Admin/courseContent';
import { isR2Configured } from '@/lib/services/r2/client';

export const dynamic = 'force-dynamic';

export default async function AdminCourseContentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getCourseContent(slug);
  if (!data) notFound();
  return <AdminCourseContent initialData={data} r2Available={isR2Configured()} />;
}
