import 'server-only';

import { createAdminClient } from '@/core/supabase/admin';
import { defaultLocale, isLocale, type Locale } from './config';

export type RecipientLocaleResolution = {
  locale: Locale;
  source: 'profile' | 'hint' | 'default';
};

/** Resolve a recipient outside the current request without hiding provider failures. */
export async function resolveRecipientLocale(
  userId: string,
  hint?: unknown,
): Promise<RecipientLocaleResolution> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('profiles')
      .select('preferred_locale').eq('id', userId).maybeSingle();
    if (error) throw new Error('localeReadFailed');
    if (isLocale(data?.preferred_locale)) {
      return { locale: data.preferred_locale, source: 'profile' };
    }
    if (isLocale(hint)) return { locale: hint, source: 'hint' };
    return { locale: defaultLocale, source: 'default' };
  } catch {
    throw new Error('localeReadFailed');
  }
}
