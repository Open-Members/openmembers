import { normalizePublicUrl } from '@/core/security/public-url';

/** No offer is implied when a course has no usable checkout destination. */
export function courseAccessHref(checkoutUrl: unknown): string {
  return normalizePublicUrl(checkoutUrl) ?? '/support';
}
