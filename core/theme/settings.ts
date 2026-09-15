import { cache } from 'react';
import { hasSupabaseAdminConfiguration } from '@/core/config/env';
import { getInstallationConfig } from '@/core/config/installation.server';
import { createAdminClient } from '@/core/supabase/admin';
import { resolveTenantSettings, TENANT_SETTINGS_COLUMNS, type TenantSettings } from './branding';

export { DEFAULT_LOADING_BAR_COLORS, DEFAULT_TENANT_SETTINGS } from './branding';
export type { LoadingBarStyle, TenantSettings } from './branding';

/** Server consumers receive validated known fields, not the entire privileged row. */
export const getTenantSettings = cache(async (): Promise<TenantSettings> => {
  // Invalid installation files remain visible to the operator, outside DB fallback.
  const configuration = await getInstallationConfig();
  if (!hasSupabaseAdminConfiguration()) return resolveTenantSettings(configuration.branding);

  try {
    const { data, error } = await createAdminClient()
      .from('tenant_settings')
      .select(TENANT_SETTINGS_COLUMNS)
      .limit(1)
      .maybeSingle();
    return resolveTenantSettings(configuration.branding, error ? null : data);
  } catch {
    return resolveTenantSettings(configuration.branding);
  }
});
