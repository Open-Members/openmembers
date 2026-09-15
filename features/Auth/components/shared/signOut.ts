'use client';

import { createClient } from '@/core/supabase/client';

type SignOut = () => Promise<{ error: unknown | null }>;
type ReplaceDocument = (destination: string) => void;

export async function signOutAndNavigate(
  signOut: SignOut = () => createClient().auth.signOut(),
  replaceDocument: ReplaceDocument = (destination) => window.location.replace(destination),
) {
  const { error } = await signOut();
  if (error) return { error: 'unexpected' as const };

  replaceDocument('/login');
  return { success: true as const };
}
