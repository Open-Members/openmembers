import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGACY_TENANT_SETTINGS_COLUMNS, TENANT_SETTINGS_COLUMNS } from './branding';
import { APPEARANCE_COLUMNS } from './appearance';

/** An additive rollout must not replace a saved brand with file defaults. */
export async function readTenantSettings(client: SupabaseClient, includeId = false) {
  const prefix = includeId ? 'id, ' : '';
  const result = await client
    .from('tenant_settings')
    .select(prefix + TENANT_SETTINGS_COLUMNS)
    .limit(1)
    .maybeSingle();
  const error = result.error;
  const missingAppearance =
    error &&
    ['42703', 'PGRST204'].includes(error.code) &&
    APPEARANCE_COLUMNS.some((column) => `${error.message} ${error.details ?? ''}`.includes(column));
  if (!missingAppearance)
    return {
      ...result,
      data: result.data as unknown as Record<string, unknown> | null,
      appearanceAvailable: !error,
    };
  const legacy = await client
    .from('tenant_settings')
    .select(prefix + LEGACY_TENANT_SETTINGS_COLUMNS)
    .limit(1)
    .maybeSingle();
  return {
    ...legacy,
    data: legacy.data as unknown as Record<string, unknown> | null,
    appearanceAvailable: false,
  };
}
