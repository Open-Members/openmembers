import { getReadableForeground, normalizeHex } from '@/core/theme/contrast';
import { normalizePublicUrl } from '@/core/security/public-url';
import { DEFAULT_TENANT_SETTINGS } from '@/core/theme/branding';

export const DEFAULT_EMAIL_PRIMARY_COLOR = DEFAULT_TENANT_SETTINGS.primary_color;

/** Email styles stay inline because many mail clients discard CSS variables. */
export function getEmailColors(value?: string | null) {
  const primary = normalizeHex(value, DEFAULT_EMAIL_PRIMARY_COLOR);
  const foreground = getReadableForeground(primary);
  return {
    primary,
    foreground,
    // A pale brand color remains visible on its button, while links stay readable.
    link: foreground === '#ffffff' ? primary : '#040d1f',
  };
}

/** Renderers accept absolute destinations; relative installation paths are resolved by callers. */
export function normalizeEmailUrl(value: unknown, allowContact = false): string | null {
  const normalized = normalizePublicUrl(value, { allowContact });
  return normalized?.startsWith('/') ? null : normalized;
}

export function requireEmailActionUrl(value: unknown): string {
  const normalized = normalizeEmailUrl(value);
  if (!normalized) throw new Error('Email action URL must be an absolute HTTPS URL without credentials (HTTP is allowed on localhost).');
  return normalized;
}
