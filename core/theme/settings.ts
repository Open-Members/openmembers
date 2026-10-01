import { cache } from 'react';
import { hasSupabaseAdminConfiguration } from '@/core/config/env';
import { getInstallationConfig } from '@/core/config/installation.server';
import { createAdminClient } from '@/core/supabase/admin';
import { resolveTenantSettings, type TenantSettings } from './branding';
import { readTenantSettings } from './settings-read';

export { DEFAULT_LOADING_BAR_COLORS, DEFAULT_TENANT_SETTINGS } from './branding';
export type { LoadingBarStyle, TenantSettings } from './branding';

/** Server consumers receive validated known fields, not the entire privileged row. */
export const getTenantSettings = cache(async (): Promise<TenantSettings> => {
  // Invalid installation files remain visible to the operator, outside DB fallback.
  const configuration = await getInstallationConfig();
  if (!hasSupabaseAdminConfiguration()) return resolveTenantSettings(configuration.branding);

  try {
    const { data, error } = await readTenantSettings(createAdminClient());
    return resolveTenantSettings(configuration.branding, error ? null : data);
  } catch {
    return resolveTenantSettings(configuration.branding);
  }
});
