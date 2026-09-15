import { createClient } from '@/core/supabase/server';
import { createAdminClient } from '@/core/supabase/admin';
import type { UserRole } from '@/shared/types/interfaces';

/** Server-only helper, intentionally outside a Server Action module. */
export async function requireAdmin() {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) throw new Error('Unauthenticated');
  const { data: profile, error } = await session.from('profiles')
    .select('role, status').eq('id', user.id).single();
  if (error || profile?.status !== 'active' || !['admin', 'super_admin'].includes(profile.role)) {
    throw new Error('Forbidden');
  }
  const adminClient = createAdminClient();
  return { supabase: adminClient, adminClient, callerId: user.id, callerRole: profile.role as UserRole };
}

/** Ordinary administrators can manage student accounts, never elevated accounts. */
export async function requireManageableUser(targetId: string) {
  const context = await requireAdmin();
  const { data: target, error } = await context.adminClient.from('profiles')
    .select('role').eq('id', targetId).single();
  if (error || !target) throw new Error('User not found');
  if (target.role !== 'user' && context.callerRole !== 'super_admin') {
    throw new Error('Only super_admin can manage elevated accounts');
  }
  return context;
}
