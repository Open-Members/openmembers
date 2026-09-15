import 'server-only';
import { createClient } from '@/core/supabase/server';
import { hasSupabaseConfiguration } from '@/core/config/env';
import { resolveLocale, type Locale } from './config';

/** Called from next-intl's request-scoped configuration; never cache across users. */
export async function getPreferredLocale(negotiated: unknown): Promise<Locale> {
  if (!hasSupabaseConfiguration()) return resolveLocale(null, negotiated);
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return resolveLocale(null, negotiated);
    const { data, error } = await supabase.from('profiles')
      .select('preferred_locale').eq('id', user.id).maybeSingle();
    // A missing preference or unavailable profile must not break public pages.
    // Authentication/authorization remains enforced by the route guards.
    return resolveLocale(error ? null : data?.preferred_locale, negotiated);
  } catch {
    return resolveLocale(null, negotiated);
  }
}
