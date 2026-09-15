import { cache } from 'react';
import { createAdminClient } from '@/core/supabase/admin';
import { MENU_ICON_NAMES, type CustomMenuItem, type MenuIconName } from './types';
import { normalizePublicUrl } from '@/core/security/public-url';

const ICON_SET = new Set<string>(MENU_ICON_NAMES);

/**
 * Loads enabled custom user-menu items, ordered by the admin-set sequence.
 * Runs through the service-role client so it bypasses RLS — safe because
 * the only filter is `is_enabled = true` and the payload is label/url/icon
 * (no PII). The render surface (TopNav) already requires an authenticated
 * user via the route layout guard.
 */
export const getCustomMenuItems = cache(async (): Promise<CustomMenuItem[]> => {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('custom_menu_items')
      .select('id, label, url, icon_name, sort_order, is_enabled')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true });

    if (error || !data) return [];

    return data.flatMap((row) => {
      const url = normalizePublicUrl(row.url, { allowContact: true });
      if (!url || typeof row.label !== 'string' || !row.label.trim()) return [];
      return [{
      id: row.id,
      label: row.label,
      url,
      iconName: normalizeIconName(row.icon_name),
      sortOrder: row.sort_order,
      isEnabled: row.is_enabled,
      }];
    });
  } catch {
    return [];
  }
});

function normalizeIconName(raw: string | null): MenuIconName | null {
  if (!raw) return null;
  return ICON_SET.has(raw) ? (raw as MenuIconName) : null;
}
