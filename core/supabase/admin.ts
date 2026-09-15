import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerFetch } from './server-transport';

/**
 * Service-role Supabase client — bypasses RLS.
 * Server use only. Each caller must enforce authorization before privileged work.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Surface misconfig loudly instead of letting `undefined!` bypass the
  // type guard and produce a client whose every query fails silently.
  if (!url || !key) {
    throw new Error(
      'createAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: createSupabaseServerFetch() },
  });
}
