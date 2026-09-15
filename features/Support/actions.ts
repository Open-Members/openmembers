'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/core/supabase/server';
import {
  createSupportTicketSchema,
  updateSupportTicketSchema,
  formDataToObject,
} from '@/core/validation/schemas';
import { notifyAdminOfNewTicket } from './notify';

export type SupportActionErrorCode =
  | 'notAuthenticated'
  | 'accountInactive'
  | 'notAuthorized'
  | 'invalidInput'
  | 'notFound'
  | 'operationFailed';

type SupportActionResult<T extends object = object> =
  | ({ success: true } & T)
  | { error: SupportActionErrorCode };

function errorCode(error: unknown): SupportActionErrorCode {
  const code = error instanceof Error ? error.message : '';
  return code === 'notAuthenticated' || code === 'accountInactive'
    ? code
    : 'operationFailed';
}

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error('operationFailed');
  if (!user) throw new Error('notAuthenticated');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();
  if (profileError) throw new Error('operationFailed');
  if (!profile || profile.status !== 'active') throw new Error('accountInactive');

  return {
    supabase,
    userId: user.id,
    role: (profile?.role as string) ?? 'user',
  };
}

export async function createSupportTicket(
  formData: FormData,
): Promise<SupportActionResult<{ id: string }>> {
  let auth;
  try {
    auth = await requireAuth();
  } catch (error) {
    return { error: errorCode(error) };
  }
  const { supabase, userId } = auth;

  const raw = formDataToObject(formData);
  const parsed = createSupportTicketSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: 'invalidInput' };
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: userId,
      subject: parsed.data.subject,
      message: parsed.data.message,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[createSupportTicket] insert failed:', error);
    return { error: 'operationFailed' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) {
    console.warn('[createSupportTicket] display name lookup failed');
  }
  await notifyAdminOfNewTicket({
    userId,
    ticketId: data.id,
    subject: parsed.data.subject,
    message: parsed.data.message,
    userDisplayName: profile?.display_name ?? null,
  });

  revalidatePath('/support');
  revalidatePath('/admin/support');
  return { success: true, id: data.id };
}

export async function updateSupportTicket(
  input: { id: string; status: 'open' | 'in_progress' | 'closed'; adminNote?: string },
): Promise<SupportActionResult> {
  let auth;
  try {
    auth = await requireAuth();
  } catch (error) {
    return { error: errorCode(error) };
  }

  if (!['admin', 'super_admin'].includes(auth.role)) {
    return { error: 'notAuthorized' };
  }

  const parsed = updateSupportTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'invalidInput' };
  }

  const { supabase } = auth;
  const { data, error } = await supabase
    .from('support_tickets')
    .update({
      status: parsed.data.status,
      admin_note: parsed.data.adminNote ?? null,
    })
    .eq('id', parsed.data.id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[updateSupportTicket] update failed:', error);
    return { error: 'operationFailed' };
  }
  if (!data) return { error: 'notFound' };

  revalidatePath('/admin/support');
  revalidatePath(`/admin/support/${parsed.data.id}`);
  revalidatePath('/support');
  return { success: true };
}
