const INTERNAL_ORIGIN = 'https://openmembers.invalid';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Validate an explicit application origin; HTTP is reserved for local development. */
export function parseAuthOrigin(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\/[^/?#\\\s]+\/?$/.test(trimmed)) {
    throw new Error('Invalid authentication origin configuration');
  }
  const url = new URL(trimmed);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) ||
    url.username || url.password || url.search || url.hash || url.pathname !== '/'
  ) {
    throw new Error('Invalid authentication origin configuration');
  }
  return url.origin;
}

/** Untrusted proxy headers may select only a fully configured origin. */
export function resolveAuthOrigin(
  headers: Pick<Headers, 'get'>,
  canonicalValue = process.env.NEXT_PUBLIC_SITE_URL ?? '',
  additionalValues = process.env.AUTH_ALLOWED_ORIGINS ?? '',
): string {
  const canonical = parseAuthOrigin(canonicalValue);
  const allowed = new Set([
    canonical,
    ...additionalValues.split(',').filter((value) => value.trim()).map(parseAuthOrigin),
  ]);
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  const proto = headers.get('x-forwarded-proto') ?? new URL(canonical).protocol.slice(0, -1);
  if (!host || !/^(https?)$/.test(proto)) return canonical;
  try {
    const requested = parseAuthOrigin(`${proto}://${host}`);
    return allowed.has(requested) ? requested : canonical;
  } catch {
    return canonical;
  }
}

/** Return only an internal destination, including its legitimate query/hash. */
export function sanitizeAuthNext(raw: unknown): string {
  const fallback = '/dashboard';
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  const hasControl = [...decoded].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (decoded.startsWith('//') || decoded.includes('\\') || hasControl) return fallback;
  try {
    const destination = new URL(raw, INTERNAL_ORIGIN);
    if (destination.origin !== INTERNAL_ORIGIN) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
