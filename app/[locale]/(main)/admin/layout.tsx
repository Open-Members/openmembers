import { redirect } from 'next/navigation';
import { createClient } from '@/core/supabase/server';
import { AdminSidebar } from '@/shared/components/navigation/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (profile?.status === 'suspended') redirect('/suspended');

  if (!profile || profile.status !== 'active' || !['admin', 'super_admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-1">
      <AdminSidebar />
      <div className="flex-1 min-w-0 px-4 md:px-6 lg:px-8 py-6 md:py-8 bg-[var(--color-muted)]/30">
        {children}
      </div>
    </div>
  );
}
