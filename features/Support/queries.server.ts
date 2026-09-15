import 'server-only';
import { createClient } from '@/core/supabase/server';
import { requireAdmin } from '@/core/access/admin';
import type { SupportTicketRow, AdminSupportTicketRow, SupportTicketStatus } from './types';

export async function listMyTickets(): Promise<SupportTicketRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error('loadFailed');
  if (!user) return [];

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, user_id, subject, message, status, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[support.listMyTickets] query failed:', error);
    throw new Error('loadFailed');
  }
  return (data ?? []).map((ticket) => ({ ...ticket, admin_note: null })) as SupportTicketRow[];
}

export async function getMyTicket(id: string): Promise<SupportTicketRow | null> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error('loadFailed');
  if (!user) return null;
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, user_id, subject, message, status, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error('[support.getMyTicket] query failed:', error);
    throw new Error('loadFailed');
  }
  return data ? { ...data, admin_note: null } as SupportTicketRow : null;
}

// Internal notes are readable only through a server client after the active
// administrator guard; authenticated REST has no SELECT privilege on that column.

export async function listAllTickets(
  statusFilter?: SupportTicketStatus,
): Promise<AdminSupportTicketRow[]> {
  const { adminClient: supabase } = await requireAdmin();

  let query = supabase
    .from('support_tickets')
    .select(
      'id, user_id, subject, message, status, admin_note, created_at, updated_at, user:profiles!support_tickets_user_id_fkey(id, display_name)',
    )
    .order('created_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    // The FK join above assumes support_tickets.user_id references
    // profiles.id (not auth.users). If Supabase rejects the relation,
    // fall back to a plain select and enrich with a separate lookup.
    console.warn(
      '[support.listAllTickets] joined query failed, retrying without user join:',
      error.message,
    );

    let fallback = supabase
      .from('support_tickets')
      .select('id, user_id, subject, message, status, admin_note, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (statusFilter) fallback = fallback.eq('status', statusFilter);

    const fallbackRes = await fallback;
    if (fallbackRes.error) {
      console.error('[support.listAllTickets] fallback failed:', fallbackRes.error);
      throw new Error('loadFailed');
    }

    const rows = fallbackRes.data ?? [];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    if (userIds.length === 0) {
      return rows.map((r) => ({ ...r, user: null })) as AdminSupportTicketRow[];
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    if (profilesError) {
      console.error('[support.listAllTickets] profile enrichment failed:', profilesError);
      throw new Error('loadFailed');
    }
    const byId = new Map(
      (profiles ?? []).map((p) => [p.id, { id: p.id, display_name: p.display_name }]),
    );
    return rows.map((r) => ({ ...r, user: byId.get(r.user_id) ?? null })) as AdminSupportTicketRow[];
  }

  return (data ?? []) as unknown as AdminSupportTicketRow[];
}

export async function getTicketForAdmin(id: string): Promise<AdminSupportTicketRow | null> {
  const { adminClient: supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, user_id, subject, message, status, admin_note, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[support.getTicketForAdmin] query failed:', error);
    throw new Error('loadFailed');
  }
  if (!data) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', data.user_id)
    .maybeSingle();
  if (profileError) {
    console.error('[support.getTicketForAdmin] profile query failed:', profileError);
    throw new Error('loadFailed');
  }

  return {
    ...(data as SupportTicketRow),
    user: profile ? { id: profile.id, display_name: profile.display_name } : null,
  };
}
